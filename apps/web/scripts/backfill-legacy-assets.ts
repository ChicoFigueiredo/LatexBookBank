import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { PrismaLibSql } from "@prisma/adapter-libsql";

import { PrismaClient } from "../src/generated/prisma/client.ts";
import { LocalFileStorageProvider } from "../src/infrastructure/storage/local/local-file-storage-provider.ts";

/**
 * Completa a capa das publicações já importadas da Fase 11 — não é um import novo, é o que faltou
 * no `map-legacy-library.ts` original: ele só sabe de `Questao`/`Questao_Itens`/`Publication` (as
 * tabelas do `.knowchico`), nunca tocou o filesystem da biblioteca.
 *
 * `<Título>.detail.json` está **vazio em toda publicação checada** (2026-08-31) — não há
 * metadata para trazer. `cover.jpg`/`cover.png` são reais; um PDF fonte solto na pasta (achado
 * numa das 8, `Prof-Mat/pub0000000008`) também é — os dois são gravados aqui.
 *
 * **Lista antes de gravar** (PLT-16): sem `CONFIRM=yes` é dry-run — diz o que gravaria e não
 * escreve nada, nem no banco nem no storage. O asset e o vínculo com a publicação vão numa
 * transação só, e o vínculo só pega se a publicação ainda não tem capa (ou fonte): uma queda entre
 * os dois não deixa mais um `Asset` órfão, e rodar de novo não cria um segundo.
 *
 *     bun run scripts/backfill-legacy-assets.ts                # dry-run
 *     CONFIRM=yes bun run scripts/backfill-legacy-assets.ts    # grava
 */
async function main(): Promise<void> {
  const confirmed = process.env["CONFIRM"] === "yes";
  const url = process.env["DATABASE_URL"];
  const storageRoot = process.env["STORAGE_ROOT"];
  if (!url) throw new Error("DATABASE_URL ausente. Rode `bun run setup`.");
  if (!storageRoot) throw new Error("STORAGE_ROOT ausente.");

  const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  const storage = new LocalFileStorageProvider({ rootDir: storageRoot });

  /**
   * Grava o arquivo e liga à publicação — o `Asset` e o ponteiro juntos, ou nenhum dos dois.
   *
   * O `updateMany` com o ponteiro nulo no `where` é o guarda da corrida: se outra execução (ou o
   * app) ligou um arquivo entre a leitura e aqui, a transação desfaz o `Asset` em vez de deixá-lo
   * solto.
   */
  const attach = async (input: {
    readonly workspaceId: string;
    readonly publicationId: string;
    readonly kind: "COVER" | "SOURCE_PDF";
    readonly bytes: Uint8Array;
    readonly mimeType: string;
    readonly originalFilename: string;
  }): Promise<{ readonly sizeBytes: number } | null> => {
    const stored = await storage.put({
      workspaceId: input.workspaceId,
      content: input.bytes,
      mimeType: input.mimeType,
      originalFilename: input.originalFilename,
    });
    const pointer = input.kind === "COVER" ? "coverAssetId" : "sourcePdfAssetId";

    return prisma.$transaction(async (tx) => {
      const asset = await tx.asset.create({
        data: {
          workspaceId: input.workspaceId,
          publicationId: input.publicationId,
          kind: input.kind,
          storageKey: stored.storageKey,
          mimeType: input.mimeType,
          originalFilename: input.originalFilename,
          sha256: stored.sha256,
          sizeBytes: stored.sizeBytes,
        },
        select: { id: true },
      });
      const linked = await tx.publication.updateMany({
        where: { id: input.publicationId, [pointer]: null },
        data: { [pointer]: asset.id },
      });
      if (linked.count === 0) {
        // Alguém ligou outro arquivo nesse meio-tempo: o deste fica de fora, sem linha órfã.
        await tx.asset.delete({ where: { id: asset.id } });
        return null;
      }
      return { sizeBytes: stored.sizeBytes };
    });
  };

  let planned = 0;

  try {
    const workspaces = await prisma.workspace.findMany({
      where: { legacyId: { not: null }, legacySourcePath: { not: null } },
      select: {
        id: true,
        name: true,
        legacySourcePath: true,
        publications: {
          select: { id: true, legacyId: true, coverAssetId: true, sourcePdfAssetId: true },
        },
      },
    });

    for (const workspace of workspaces) {
      const libraryDir = path.dirname(workspace.legacySourcePath as string);

      for (const publication of workspace.publications) {
        if (publication.coverAssetId !== null || publication.legacyId === null) continue;

        const folder = `pub${String(publication.legacyId).padStart(10, "0")}`;

        // A maioria é `.jpg`; ao menos uma biblioteca real (ProfMat) tem `.png` — descoberto
        // rodando contra o acervo, não hipótese.
        let bytes: Uint8Array | null = null;
        let mimeType = "image/jpeg";
        let coverFilename = "cover.jpg";
        for (const [filename, mime] of [
          ["cover.jpg", "image/jpeg"],
          ["cover.png", "image/png"],
        ] as const) {
          try {
            bytes = new Uint8Array(await readFile(path.join(libraryDir, folder, filename)));
            mimeType = mime;
            coverFilename = filename;
            break;
          } catch {
            // tenta a próxima extensão
          }
        }

        if (bytes === null) {
          console.log(`—  ${workspace.name} / pub${publication.legacyId}: sem capa (jpg/png)`);
          continue;
        }

        planned += 1;
        if (!confirmed) {
          console.log(`·  ${workspace.name} / pub${publication.legacyId}: gravaria a capa (${bytes.byteLength} bytes)`);
          continue;
        }

        const done = await attach({
          workspaceId: workspace.id,
          publicationId: publication.id,
          kind: "COVER",
          bytes,
          mimeType,
          originalFilename: coverFilename,
        });
        console.log(
          done
            ? `✅ ${workspace.name} / pub${publication.legacyId}: capa gravada (${done.sizeBytes} bytes)`
            : `—  ${workspace.name} / pub${publication.legacyId}: já ganhou capa por outro caminho`,
        );
      }

      // PDF fonte: um arquivo `.pdf` solto direto na pasta `pub<N>` (não dentro de `idQuestionM/`,
      // que é conteúdo por questão, não da publicação). Achado numa só das 8 reais — a maioria
      // não tem PDF fonte no filesystem, só o registro de Publication.
      for (const publication of workspace.publications) {
        if (publication.sourcePdfAssetId !== null || publication.legacyId === null) continue;

        const folder = `pub${String(publication.legacyId).padStart(10, "0")}`;
        const pubDir = path.join(libraryDir, folder);

        let pdfFilename: string | null = null;
        try {
          const entries = await readdir(pubDir, { withFileTypes: true });
          pdfFilename =
            entries.find((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
              ?.name ?? null;
        } catch {
          continue;
        }
        if (pdfFilename === null) continue;

        const bytes = new Uint8Array(await readFile(path.join(pubDir, pdfFilename)));

        planned += 1;
        if (!confirmed) {
          console.log(
            `·  ${workspace.name} / pub${publication.legacyId}: gravaria o PDF fonte (${pdfFilename}, ${bytes.byteLength} bytes)`,
          );
          continue;
        }

        const done = await attach({
          workspaceId: workspace.id,
          publicationId: publication.id,
          kind: "SOURCE_PDF",
          bytes,
          mimeType: "application/pdf",
          originalFilename: pdfFilename,
        });
        console.log(
          done
            ? `✅ ${workspace.name} / pub${publication.legacyId}: PDF fonte gravado (${pdfFilename}, ${done.sizeBytes} bytes)`
            : `—  ${workspace.name} / pub${publication.legacyId}: já ganhou PDF fonte por outro caminho`,
        );
      }
    }

    if (!confirmed) {
      console.log(`\n${planned} arquivo(s) a gravar. Nada foi escrito. Rode com CONFIRM=yes para gravar.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

await main();

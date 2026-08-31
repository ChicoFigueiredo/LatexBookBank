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
 *     bun run scripts/backfill-legacy-assets.ts
 */
async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  const storageRoot = process.env["STORAGE_ROOT"];
  if (!url) throw new Error("DATABASE_URL ausente. Rode `bun run setup`.");
  if (!storageRoot) throw new Error("STORAGE_ROOT ausente.");

  const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  const storage = new LocalFileStorageProvider({ rootDir: storageRoot });

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
        for (const [filename, mime] of [
          ["cover.jpg", "image/jpeg"],
          ["cover.png", "image/png"],
        ] as const) {
          try {
            bytes = new Uint8Array(await readFile(path.join(libraryDir, folder, filename)));
            mimeType = mime;
            break;
          } catch {
            // tenta a próxima extensão
          }
        }

        if (bytes === null) {
          console.log(`—  ${workspace.name} / pub${publication.legacyId}: sem capa (jpg/png)`);
          continue;
        }

        const stored = await storage.put({ workspaceId: workspace.id, content: bytes, mimeType });

        const asset = await prisma.asset.create({
          data: {
            workspaceId: workspace.id,
            publicationId: publication.id,
            kind: "COVER",
            storageKey: stored.storageKey,
            mimeType,
            sha256: stored.sha256,
            sizeBytes: stored.sizeBytes,
          },
          select: { id: true },
        });

        await prisma.publication.update({
          where: { id: publication.id },
          data: { coverAssetId: asset.id },
        });

        console.log(`✅ ${workspace.name} / pub${publication.legacyId}: capa gravada (${stored.sizeBytes} bytes)`);
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
        const stored = await storage.put({
          workspaceId: workspace.id,
          content: bytes,
          mimeType: "application/pdf",
        });

        const asset = await prisma.asset.create({
          data: {
            workspaceId: workspace.id,
            publicationId: publication.id,
            kind: "SOURCE_PDF",
            storageKey: stored.storageKey,
            mimeType: "application/pdf",
            sha256: stored.sha256,
            sizeBytes: stored.sizeBytes,
          },
          select: { id: true },
        });

        await prisma.publication.update({
          where: { id: publication.id },
          data: { sourcePdfAssetId: asset.id },
        });

        console.log(
          `✅ ${workspace.name} / pub${publication.legacyId}: PDF fonte gravado (${pdfFilename}, ${stored.sizeBytes} bytes)`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

await main();

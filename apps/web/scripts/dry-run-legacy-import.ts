import { writeFile } from "node:fs/promises";
import path from "node:path";

import { PrismaLibSql } from "@prisma/adapter-libsql";

import { PrismaClient } from "../src/generated/prisma/client.ts";
import { resolveLegacyFigures } from "../src/modules/legacy-import/application/import-legacy-figures.ts";
import { buildLegacyImportReport } from "../src/modules/legacy-import/application/legacy-import-report.ts";
import { mapLegacyLibrary } from "../src/modules/legacy-import/application/map-legacy-library.ts";
import { NodeLegacyFsProbe } from "../src/modules/legacy-import/infrastructure/node-legacy-fs-probe.ts";
import { SqliteLegacyLibraryReader } from "../src/modules/legacy-import/infrastructure/sqlite-legacy-library-reader.ts";
import { toRuntime, type ExistingIndex } from "../src/modules/portability/application/import-workspace.ts";
import { normalizeIsbn } from "../src/modules/publications/domain/isbn.ts";

/**
 * Simula o import de uma biblioteca inteira — mapeia, confere colisão contra o banco de
 * verdade, **nada é escrito**. Issue #111, Fase 11, bloco "Execução": "Dry-run sem nenhuma escrita".
 *
 *     LEGACY_LIBRARY_PATH=/mnt/t/KnowChico/Cesgranrio.CAIXA/metadata.knowchico \
 *     WORKSPACE_NAME="Cesgranrio CAIXA" WORKSPACE_SLUG=cesgranrio-caixa \
 *       bun run scripts/dry-run-legacy-import.ts
 *
 * Com `REPORT_PATH`, grava também o `ImportReport` estruturado (`legacy-import-report.ts`) em JSON
 * — o mesmo que `write-legacy-import.ts` grava —, para comparar duas rodadas com um `diff`.
 *
 * O índice do destino é consultado direto pelo Prisma aqui dentro, sem passar por
 * `readExistingIndex` — aquele arquivo é `server-only`, e um script não é um Server Component.
 * Mesma consulta, mesmo formato de índice.
 */
async function readExistingIndex(prisma: PrismaClient): Promise<ExistingIndex> {
  const [bibliotecas, publicacoes, nos] = await Promise.all([
    prisma.workspace.findMany({
      where: { legacyId: { not: null } },
      select: { id: true, legacyId: true },
    }),
    prisma.publication.findMany({
      where: {
        OR: [{ legacyId: { not: null } }, { legacyUuid: { not: null } }, { isbn: { not: null } }],
      },
      select: { id: true, workspaceId: true, legacyId: true, legacyUuid: true, isbn: true },
    }),
    prisma.documentNode.findMany({
      where: { question: { legacyId: { not: null } } },
      select: { publicationId: true, question: { select: { id: true, legacyId: true } } },
    }),
  ]);

  // Com escopo (ACV-11): o `legacyId` de livro vale dentro da biblioteca, o de questão dentro do
  // livro. A numeração do legado recomeça em cada biblioteca.
  const workspacesByLegacyId = new Map<number, string>();
  for (const row of bibliotecas) {
    if (row.legacyId !== null) workspacesByLegacyId.set(row.legacyId, row.id);
  }

  const publicationsByLegacyId = new Map<string, Map<number, string>>();
  const publicationsByLegacyUuid = new Map<string, string>();
  const publicationsByIsbn = new Map<string, string>();

  for (const row of publicacoes) {
    if (row.legacyId !== null) {
      const daBiblioteca = publicationsByLegacyId.get(row.workspaceId) ?? new Map<number, string>();
      daBiblioteca.set(row.legacyId, row.id);
      publicationsByLegacyId.set(row.workspaceId, daBiblioteca);
    }
    if (row.legacyUuid !== null) publicationsByLegacyUuid.set(row.legacyUuid, row.id);
    const isbn = normalizeIsbn(row.isbn);
    if (isbn !== null) publicationsByIsbn.set(isbn, row.id);
  }

  const questionsByLegacyId = new Map<string, Map<number, string>>();
  for (const row of nos) {
    if (row.question === null || row.question.legacyId === null) continue;
    const doLivro = questionsByLegacyId.get(row.publicationId) ?? new Map<number, string>();
    doLivro.set(row.question.legacyId, row.question.id);
    questionsByLegacyId.set(row.publicationId, doLivro);
  }

  return {
    workspacesByLegacyId,
    publicationsByLegacyId,
    publicationsByLegacyUuid,
    publicationsByIsbn,
    questionsByLegacyId,
  };
}

async function main(): Promise<void> {
  const libraryPath = process.env["LEGACY_LIBRARY_PATH"];
  const workspaceName = process.env["WORKSPACE_NAME"];
  const workspaceSlug = process.env["WORKSPACE_SLUG"];

  if (!libraryPath || !workspaceName || !workspaceSlug) {
    console.error(
      "LEGACY_LIBRARY_PATH, WORKSPACE_NAME e WORKSPACE_SLUG são obrigatórios.",
    );
    process.exitCode = 1;
    return;
  }

  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL ausente. Rode `bun run setup`.");

  const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });

  try {
    const contents = await new SqliteLegacyLibraryReader(libraryPath).read();
    // As figuras são lidas do disco aqui também — o dry-run precisa dizer quantas iriam, e o
    // LaTeX mapeado já sai citando o nome do asset. Nada é gravado: nem storage, nem banco.
    const figures = await resolveLegacyFigures(contents, new NodeLegacyFsProbe(), {
      libraryDir: path.dirname(libraryPath),
    });
    const mapping = mapLegacyLibrary(contents, { workspaceName, workspaceSlug, figures });

    console.log(`=== ${workspaceName} ===`);
    console.log(`${mapping.portable.publications.length} publicação(ões) no arquivo mapeado.`);
    for (const pub of mapping.portable.publications) {
      const questionCount = pub.nodes.filter((n) => n.question !== null).length;
      console.log(`  · ${pub.title} (legacyId ${pub.legacyId}) — ${pub.nodes.length} nó(s), ${questionCount} questão(ões)`);
    }

    if (mapping.excluded.length > 0) {
      console.log(`\n${mapping.excluded.length} questão(ões) excluída(s) por invariante:`);
      for (const entry of mapping.excluded) console.log(`  - ${entry.legacyId}: ${entry.reason}`);
    }

    if (mapping.orphanPublicationRefs.length > 0) {
      console.log(`\n${mapping.orphanPublicationRefs.length} questão(ões) com idPublication órfão:`);
      for (const entry of mapping.orphanPublicationRefs) {
        console.log(`  - questão ${entry.legacyQuestionId} → idPublication ${entry.idPublication} (não existe em Publication)`);
      }
    }

    if (mapping.coercedDifficulty.length > 0) {
      console.log(`\n${mapping.coercedDifficulty.length} dificuldade(s) fora da escala, coagida(s) para 5.`);
    }

    const attached = figures.figures.length - mapping.unattachedFigures.length;
    console.log(`\n${figures.figures.length} figura(s) no disco; ${attached} iria(m) como Asset de questão.`);
    for (const entry of mapping.unattachedFigures) {
      console.log(`  - questão ${entry.legacyQuestionId} · ${entry.relativePath}: sem questão no destino (${entry.reason})`);
    }
    for (const entry of figures.skipped) {
      console.log(`  - questão ${entry.legacyQuestionId} · ${entry.field} · ${entry.ref}: ${entry.reason}`);
    }

    const existingIndex = await readExistingIndex(prisma);
    const plan = toRuntime(mapping.portable, existingIndex);

    console.log(`\n=== Contra o banco atual ===`);
    if (plan.collisions.length === 0) {
      console.log("Nenhuma colisão — importaria tudo como novo.");
    } else {
      console.log(`${plan.collisions.length} colisão(ões) — já existe(m) no destino:`);
      for (const collision of plan.collisions) {
        console.log(`  - ${collision.kind} por ${collision.by}=${collision.value} → id existente ${collision.existingId}`);
      }
    }

    const reportPath = process.env["REPORT_PATH"];
    if (reportPath) {
      const report = buildLegacyImportReport({
        mapping,
        skippedFigures: figures.skipped,
        attachedFigures: figures.figures.length - mapping.unattachedFigures.length,
        written: null,
      });
      await writeFile(reportPath, JSON.stringify(report, null, 2));
      console.log(`\nRelatório em ${reportPath}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

await main();

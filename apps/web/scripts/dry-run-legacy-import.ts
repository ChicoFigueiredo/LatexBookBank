import { PrismaLibSql } from "@prisma/adapter-libsql";

import { PrismaClient } from "../src/generated/prisma/client.ts";
import { mapLegacyLibrary } from "../src/modules/legacy-import/application/map-legacy-library.ts";
import { SqliteLegacyLibraryReader } from "../src/modules/legacy-import/infrastructure/sqlite-legacy-library-reader.ts";
import {
  normalizeIsbn,
  toRuntime,
  type ExistingIndex,
} from "../src/modules/portability/application/import-workspace.ts";

/**
 * Simula o import de uma biblioteca inteira — mapeia, confere colisão contra o banco de
 * verdade, **nada é escrito**. Issue #111, Fase 11, bloco "Execução": "Dry-run sem nenhuma escrita".
 *
 *     LEGACY_LIBRARY_PATH=/mnt/t/KnowChico/Cesgranrio.CAIXA/metadata.knowchico \
 *     WORKSPACE_NAME="Cesgranrio CAIXA" WORKSPACE_SLUG=cesgranrio-caixa \
 *       bun run scripts/dry-run-legacy-import.ts
 *
 * O índice do destino é consultado direto pelo Prisma aqui dentro, sem passar por
 * `readExistingIndex` — aquele arquivo é `server-only`, e um script não é um Server Component.
 * Mesma consulta, mesmo formato de índice.
 */
async function readExistingIndex(prisma: PrismaClient): Promise<ExistingIndex> {
  const [publicacoes, questoes] = await Promise.all([
    prisma.publication.findMany({
      where: {
        OR: [{ legacyId: { not: null } }, { legacyUuid: { not: null } }, { isbn: { not: null } }],
      },
      select: { id: true, legacyId: true, legacyUuid: true, isbn: true },
    }),
    prisma.question.findMany({
      where: { legacyId: { not: null } },
      select: { id: true, legacyId: true },
    }),
  ]);

  const publicationsByLegacyId = new Map<number, string>();
  const publicationsByLegacyUuid = new Map<string, string>();
  const publicationsByIsbn = new Map<string, string>();

  for (const row of publicacoes) {
    if (row.legacyId !== null) publicationsByLegacyId.set(row.legacyId, row.id);
    if (row.legacyUuid !== null) publicationsByLegacyUuid.set(row.legacyUuid, row.id);
    const isbn = normalizeIsbn(row.isbn);
    if (isbn !== null) publicationsByIsbn.set(isbn, row.id);
  }

  const questionsByLegacyId = new Map<number, string>();
  for (const row of questoes) {
    if (row.legacyId !== null) questionsByLegacyId.set(row.legacyId, row.id);
  }

  return { publicationsByLegacyId, publicationsByLegacyUuid, publicationsByIsbn, questionsByLegacyId };
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
    const mapping = mapLegacyLibrary(contents, { workspaceName, workspaceSlug });

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
  } finally {
    await prisma.$disconnect();
  }
}

await main();

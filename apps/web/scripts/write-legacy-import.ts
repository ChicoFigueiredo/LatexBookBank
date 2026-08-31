import { PrismaLibSql } from "@prisma/adapter-libsql";

import { PrismaClient } from "../src/generated/prisma/client.ts";
import { mapLegacyLibrary } from "../src/modules/legacy-import/application/map-legacy-library.ts";
import { PrismaLegacyImportWriter } from "../src/modules/legacy-import/infrastructure/prisma-legacy-import-writer.ts";
import { SqliteLegacyLibraryReader } from "../src/modules/legacy-import/infrastructure/sqlite-legacy-library-reader.ts";
import { EMPTY_INDEX, toRuntime } from "../src/modules/portability/application/import-workspace.ts";

/**
 * Escreve de verdade — lê, mapeia, grava numa transação. Issue #111, Fase 11.
 *
 * A idempotência é no **workspace**, por `IdBiblio` (`Workspace.legacyId`, `@@unique`), não
 * questão por questão: cada biblioteca reinicia sua própria numeração `IdQuestao` em 1, e duas
 * bibliotecas diferentes colidirem por acidente nesse número foi um bug real da primeira versão
 * deste script (2026-08-31) — o índice de colisão do `.lbb` não tem escopo de workspace. Aqui só
 * se pergunta "esta biblioteca (por IdBiblio) já tem workspace?" — se não, o resto é gravação
 * fresca, sem checar colisão questão a questão, porque um workspace novo não tem com o que colidir.
 *
 * Exige `CONFIRM=yes` de propósito: isto cria dado real no banco de `DATABASE_URL`.
 *
 *     LEGACY_ID=15 LEGACY_LIBRARY_PATH=/mnt/t/KnowChico/Analise/analise-elon.knowchico \
 *     WORKSPACE_NAME="Análise Elon" WORKSPACE_SLUG=analise-elon CONFIRM=yes \
 *       bun run scripts/write-legacy-import.ts
 */
async function main(): Promise<void> {
  const legacyIdRaw = process.env["LEGACY_ID"];
  const libraryPath = process.env["LEGACY_LIBRARY_PATH"];
  const workspaceName = process.env["WORKSPACE_NAME"];
  const workspaceSlug = process.env["WORKSPACE_SLUG"];
  const confirmed = process.env["CONFIRM"] === "yes";

  if (!legacyIdRaw || !libraryPath || !workspaceName || !workspaceSlug) {
    console.error(
      "LEGACY_ID (IdBiblio), LEGACY_LIBRARY_PATH, WORKSPACE_NAME e WORKSPACE_SLUG são obrigatórios.",
    );
    process.exitCode = 1;
    return;
  }
  const legacyId = Number(legacyIdRaw);

  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL ausente. Rode `bun run setup`.");

  const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  const writer = new PrismaLegacyImportWriter(prisma);

  try {
    console.log(`=== ${workspaceName} (IdBiblio ${legacyId}) ===`);

    const existingWorkspaceId = await writer.findExistingWorkspaceId(legacyId);
    if (existingWorkspaceId !== null) {
      console.log(`Já importada — workspace ${existingWorkspaceId} já tem esse IdBiblio. Nada feito.`);
      return;
    }

    const contents = await new SqliteLegacyLibraryReader(libraryPath).read();
    const mapping = mapLegacyLibrary(contents, { workspaceName, workspaceSlug });
    const plan = toRuntime(mapping.portable, EMPTY_INDEX);

    console.log(`${plan.workspace.publications.length} publicação(ões), ${mapping.excluded.length} excluída(s) por invariante.`);
    if (mapping.excluded.length > 0) {
      for (const entry of mapping.excluded) console.log(`  - ${entry.legacyId}: ${entry.reason}`);
    }

    if (!confirmed) {
      console.log("\nNada escrito ainda — rode de novo com CONFIRM=yes para gravar.");
      return;
    }

    const report = await writer.write(plan, { legacyId, legacySourcePath: libraryPath });

    console.log(`\nEscrito: workspace ${report.workspaceId}`);
    console.log(`  ${report.publications} publicação(ões), ${report.nodes} nó(s), ${report.questions} questão(ões), ${report.options} alternativa(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();

import { writeFile } from "node:fs/promises";
import path from "node:path";

import { PrismaLibSql } from "@prisma/adapter-libsql";

import { PrismaClient } from "../src/generated/prisma/client.ts";
import { LocalFileStorageProvider } from "../src/infrastructure/storage/local/local-file-storage-provider.ts";
import { resolveLegacyFigures } from "../src/modules/legacy-import/application/import-legacy-figures.ts";
import {
  buildLegacyImportReport,
  type LegacyImportReportJson,
} from "../src/modules/legacy-import/application/legacy-import-report.ts";
import { mapLegacyLibrary } from "../src/modules/legacy-import/application/map-legacy-library.ts";
import { NodeLegacyFsProbe } from "../src/modules/legacy-import/infrastructure/node-legacy-fs-probe.ts";
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
 * As figuras que o LaTeX cita (`images/clipboard_<ts>.png`) são lidas do disco ao lado do
 * `.knowchico`, viram `Asset` no `STORAGE_ROOT` e o texto passa a citá-las pelo nome do asset —
 * por isso o acervo precisa estar montado na hora de escrever, não só na de auditar.
 *
 * Exige `CONFIRM=yes` de propósito: isto cria dado real no banco de `DATABASE_URL`.
 *
 * O relatório é o `ImportReport` estruturado da Fase 11 (`legacy-import-report.ts`): o mesmo no
 * dry-run e na gravação, resumido no console e gravado em JSON quando `REPORT_PATH` é dado — duas
 * execuções se comparam com um `diff`.
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
  const storageRoot = process.env["STORAGE_ROOT"];
  if (!url) throw new Error("DATABASE_URL ausente. Rode `bun run setup`.");
  if (!storageRoot) throw new Error("STORAGE_ROOT ausente.");

  const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  const writer = new PrismaLegacyImportWriter(prisma);
  const storage = new LocalFileStorageProvider({ rootDir: storageRoot });

  try {
    console.log(`=== ${workspaceName} (IdBiblio ${legacyId}) ===`);

    const existingWorkspaceId = await writer.findExistingWorkspaceId(legacyId);
    if (existingWorkspaceId !== null) {
      console.log(`Já importada — workspace ${existingWorkspaceId} já tem esse IdBiblio. Nada feito.`);
      return;
    }

    const contents = await new SqliteLegacyLibraryReader(libraryPath).read();
    const figures = await resolveLegacyFigures(contents, new NodeLegacyFsProbe(), {
      libraryDir: path.dirname(libraryPath),
    });
    const mapping = mapLegacyLibrary(contents, { workspaceName, workspaceSlug, figures });
    const plan = toRuntime(mapping.portable, EMPTY_INDEX);

    const attached = figures.figures.length - mapping.unattachedFigures.length;
    const reportOf = (written: Parameters<typeof buildLegacyImportReport>[0]["written"]) =>
      buildLegacyImportReport({ mapping, skippedFigures: figures.skipped, attachedFigures: attached, written });

    if (!confirmed) {
      await emit(reportOf(null));
      console.log("\nNada escrito ainda — rode de novo com CONFIRM=yes para gravar.");
      return;
    }

    const written = await writer.write(
      plan,
      { legacyId, legacySourcePath: libraryPath },
      { resolution: figures, storage },
    );

    console.log(`\nEscrito: workspace ${written.workspaceId}`);
    await emit(reportOf(written));
  } finally {
    await prisma.$disconnect();
  }
}

/** O resumo no console, e o JSON inteiro em `REPORT_PATH` quando dado. */
async function emit(report: LegacyImportReportJson): Promise<void> {
  const { importados: i } = report;
  console.log(
    `${report.dryRun ? "Entraria" : "Entrou"}: ${i.publicacoes} publicação(ões), ${i.nos} nó(s), ` +
      `${i.questoes} questão(ões), ${i.alternativas} alternativa(s), ${i.figuras} figura(s).`,
  );
  for (const [label, entries] of [
    ["inconsistente(s)", report.inconsistentes],
    ["ignorado(s)", report.ignorados],
    ["órfão(s)", report.orfaos],
    ["asset(s) ausente(s)", report.assetsAusentes],
  ] as const) {
    if (entries.length === 0) continue;
    console.log(`${entries.length} ${label}:`);
    for (const entry of entries) console.log(`  - ${entry.legacyId}: ${entry.motivo}`);
  }

  const reportPath = process.env["REPORT_PATH"];
  if (reportPath) {
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`Relatório em ${reportPath}`);
  }
}

await main();

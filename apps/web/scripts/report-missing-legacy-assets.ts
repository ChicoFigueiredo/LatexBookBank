import path from "node:path";

import { reportMissingLegacyAssets } from "../src/modules/legacy-import/application/report-missing-legacy-assets.ts";
import { NodeLegacyFsProbe } from "../src/modules/legacy-import/infrastructure/node-legacy-fs-probe.ts";
import { SqliteLegacyLibraryReader } from "../src/modules/legacy-import/infrastructure/sqlite-legacy-library-reader.ts";

/**
 * Lista as figuras que o LaTeX de uma biblioteca cita e o disco não tem (issue #111, Fase 11 —
 * bloco "Relatório: assets ausentes").
 *
 *     LEGACY_LIBRARY_PATH=/mnt/t/KnowChico/Cesgranrio.CAIXA/metadata.knowchico \
 *       bun run scripts/report-missing-legacy-assets.ts
 *
 * Rodar **antes** do import, e no computador onde o acervo está montado: depois de importar, a
 * lista continua saindo, mas os arquivos que faltam podem já não estar em lugar nenhum.
 */
async function main(): Promise<void> {
  const libraryPath = process.env["LEGACY_LIBRARY_PATH"];
  if (!libraryPath) {
    console.error("LEGACY_LIBRARY_PATH ausente. Aponte para um `.knowchico` de uma biblioteca.");
    process.exitCode = 1;
    return;
  }

  const contents = await new SqliteLegacyLibraryReader(libraryPath).read();

  // As `pub<N>/` ficam ao lado do `.knowchico`, não dentro dele — o relatório procura a partir daí.
  const libraryDir = path.dirname(libraryPath);

  const report = await reportMissingLegacyAssets(contents, new NodeLegacyFsProbe(), { libraryDir });

  console.log(
    `${report.refs} referência(s) a arquivo em ${report.questionsWithRefs} questão(ões), ` +
      `sobre ${contents.questions.length} linha(s) de Questao.`,
  );

  if (report.refs === 0) {
    console.log("Nenhum LaTeX desta biblioteca cita arquivo — não há asset a conferir.");
    return;
  }

  if (report.missing.length === 0) {
    console.log("✅ Toda referência achou o arquivo correspondente no disco.");
    return;
  }

  console.log(`\n⛔ ${report.missing.length} referência(s) sem arquivo:`);
  for (const entry of report.missing) {
    const where = entry.expectedPath ?? "(não dá para dizer onde procurar)";
    console.log(
      `  questão ${entry.legacyQuestionId} · ${entry.field} · ${entry.reason}\n` +
        `    cita:    ${entry.ref}\n` +
        `    esperado: ${where}`,
    );
  }
}

await main();

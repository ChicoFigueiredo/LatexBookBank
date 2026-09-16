import path from "node:path";

import { scanLegacyAcervo } from "../src/modules/legacy-import/application/scan-legacy-acervo.ts";
import { NodeLegacyFsProbe } from "../src/modules/legacy-import/infrastructure/node-legacy-fs-probe.ts";
import { SqliteLegacyConfigReader } from "../src/modules/legacy-import/infrastructure/sqlite-legacy-config-reader.ts";

/**
 * Descobre as bibliotecas do acervo legado, sem ler nenhuma questão ainda (issue #111, Fase 11).
 *
 *     LEGACY_ACERVO_ROOT=/mnt/t/KnowChico bun run scripts/scan-legacy-acervo.ts
 *
 * Roda em Bun pelo mesmo motivo do importador de conhecimento LaTeX: o leitor do config fala
 * `bun:sqlite`, somente leitura e imutável — o acervo real nunca é escrito por este script.
 */
async function main(): Promise<void> {
  const rootDir = process.env["LEGACY_ACERVO_ROOT"];
  if (!rootDir) {
    console.error("LEGACY_ACERVO_ROOT ausente. Aponte para a pasta raiz do acervo KnowChico.");
    process.exitCode = 1;
    return;
  }

  const configPath = path.join(rootDir, "padrao.knowchicoconfig");
  const rootMarker = path.basename(rootDir);

  const report = await scanLegacyAcervo(
    new SqliteLegacyConfigReader(configPath),
    new NodeLegacyFsProbe(),
    { rootDir, rootMarker },
  );

  console.log(`${report.libraries.length} biblioteca(s) registrada(s) em padrao.knowchicoconfig:\n`);
  for (const lib of report.libraries) {
    const status = lib.metadataExists ? "✅" : "⛔ metadata ausente";
    const selected = lib.isSelected ? " (selecionada)" : "";
    console.log(`  ${status}  ${lib.name}${selected}  →  ${lib.relativePath}`);
  }

  if (report.unresolved.length > 0) {
    console.log(`\n${report.unresolved.length} registro(s) com caminho fora da raiz informada:`);
    for (const row of report.unresolved) console.log(`  - ${row.name}: ${row.pathFolder}`);
  }

  console.log(`\n${report.ignored.length} pasta(s) de primeiro nível ignorada(s):`);
  for (const entry of report.ignored) console.log(`  - ${entry.name}: ${entry.reason}`);
}

await main();

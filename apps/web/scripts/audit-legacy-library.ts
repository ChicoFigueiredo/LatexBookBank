import { auditLegacyLibrary } from "../src/modules/legacy-import/application/audit-legacy-library.ts";
import { SqliteLegacyLibraryReader } from "../src/modules/legacy-import/infrastructure/sqlite-legacy-library-reader.ts";

/**
 * Conta questões/alternativas e confere as invariantes de uma biblioteca real, sem escrever nada
 * (issue #111, Fase 11 — bloco "Scanner" e "Invariantes afirmadas").
 *
 *     LEGACY_LIBRARY_PATH=/mnt/t/KnowChico/Cesgranrio.CAIXA/metadata.knowchico \
 *       bun run scripts/audit-legacy-library.ts
 */
async function main(): Promise<void> {
  const libraryPath = process.env["LEGACY_LIBRARY_PATH"];
  if (!libraryPath) {
    console.error("LEGACY_LIBRARY_PATH ausente. Aponte para um `.knowchico` de uma biblioteca.");
    process.exitCode = 1;
    return;
  }

  const audit = await auditLegacyLibrary(new SqliteLegacyLibraryReader(libraryPath));

  console.log(`${audit.counts.questions} questão(ões), ${audit.counts.options} alternativa(s).`);

  if (audit.violations.length === 0) {
    console.log("Nenhuma invariante violada.");
    return;
  }

  console.log(`${audit.violations.length} invariante(s) violada(s):`);
  for (const violation of audit.violations) {
    console.log(`  ${violation.invariant}. ${violation.message} — ids: ${violation.legacyIds.join(", ")}`);
  }
}

await main();

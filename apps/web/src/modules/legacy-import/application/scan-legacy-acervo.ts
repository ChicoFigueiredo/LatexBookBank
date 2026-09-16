import path from "node:path";

import {
  relativeAcervoPath,
  type LegacyConfigReader,
  type LegacyFsProbe,
  type LegacyLibraryRow,
} from "../domain/legacy-config";

/**
 * O primeiro passo do import: descobrir o que é biblioteca antes de ler questão nenhuma.
 *
 * Ver checklist Fase 11, bloco "Escopo do scanner".
 */

export interface LegacyLibraryCandidate {
  readonly name: string;
  readonly relativePath: string;
  readonly localDir: string;
  readonly metadataPath: string;
  readonly metadataExists: boolean;
  readonly isSelected: boolean;
}

export interface IgnoredEntry {
  readonly name: string;
  readonly reason: string;
}

export interface AcervoScanReport {
  readonly libraries: readonly LegacyLibraryCandidate[];
  /** Registrado no config, mas o caminho não bateu com a raiz informada — investigar, não descartar. */
  readonly unresolved: readonly LegacyLibraryRow[];
  /** Pastas de primeiro nível que não correspondem a nenhuma biblioteca registrada. */
  readonly ignored: readonly IgnoredEntry[];
}

export interface ScanOptions {
  /** Pasta local onde o acervo está montado, ex.: `/mnt/t/KnowChico`. */
  readonly rootDir: string;
  /** Nome do marcador de raiz dentro do `PathFolder` legado, ex.: `KnowChico`. */
  readonly rootMarker: string;
}

export async function scanLegacyAcervo(
  config: LegacyConfigReader,
  fs: LegacyFsProbe,
  options: ScanOptions,
): Promise<AcervoScanReport> {
  const rows = await config.listLibraries();

  const libraries: LegacyLibraryCandidate[] = [];
  const unresolved: LegacyLibraryRow[] = [];
  const accountedTopLevel = new Set<string>();

  for (const row of rows) {
    const relative = relativeAcervoPath(row.pathFolder, options.rootMarker);
    if (relative === null) {
      unresolved.push(row);
      continue;
    }

    const topLevel = relative.split("/")[0];
    if (topLevel !== undefined) accountedTopLevel.add(topLevel.toLowerCase());

    const localDir = path.posix.join(options.rootDir, relative);
    const metadataPath = path.posix.join(localDir, row.metadataFile);

    libraries.push({
      name: row.name,
      relativePath: relative,
      localDir,
      metadataPath,
      metadataExists: await fs.exists(metadataPath),
      isSelected: row.isSelected,
    });
  }

  const topLevelDirs = await fs.listTopLevelDirectories(options.rootDir);
  const ignored: IgnoredEntry[] = topLevelDirs
    .filter((dir) => !accountedTopLevel.has(dir.toLowerCase()))
    .map((dir) => ({
      name: dir,
      reason: "não referenciado em padrao.knowchicoconfig — não é biblioteca ativa",
    }));

  return { libraries, unresolved, ignored };
}

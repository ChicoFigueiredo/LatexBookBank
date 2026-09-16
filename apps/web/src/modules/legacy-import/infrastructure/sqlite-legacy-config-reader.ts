import { Database, constants } from "bun:sqlite";
import { pathToFileURL } from "node:url";

import type { LegacyConfigReader, LegacyLibraryRow } from "../domain/legacy-config";

/**
 * Leitor do `padrao.knowchicoconfig` — mesmo padrão somente-leitura de
 * `sqlite-legacy-latex-reader.ts`: `immutable=1` evita que o WAL grave `-shm`/`-wal` ao lado do
 * arquivo, numa pasta que pode estar montada como somente-leitura.
 *
 * Sem teste unitário de propósito: `bun:sqlite` não existe sob o runtime do Vitest. A cobertura
 * real é o script `scan-legacy-acervo.ts` rodando contra o acervo de verdade.
 */

const READONLY_IMMUTABLE = constants.SQLITE_OPEN_READONLY | constants.SQLITE_OPEN_URI;
const immutableUri = (filePath: string): string => `${pathToFileURL(filePath).href}?immutable=1`;

interface RawLibraryRow {
  readonly IdBiblio: number;
  readonly Name: string;
  readonly PathFolder: string;
  readonly MetadataFile: string;
  readonly IsSelected: number;
}

export class SqliteLegacyConfigReader implements LegacyConfigReader {
  constructor(private readonly configPath: string) {}

  async listLibraries(): Promise<readonly LegacyLibraryRow[]> {
    const db = new Database(immutableUri(this.configPath), READONLY_IMMUTABLE);

    try {
      const rows = db
        .query(
          `SELECT IdBiblio, Name, PathFolder, MetadataFile, IsSelected
             FROM BibliotecasKnowChicos
            ORDER BY IdBiblio`,
        )
        .all() as RawLibraryRow[];

      return rows.map((row) => ({
        id: row.IdBiblio,
        name: row.Name,
        pathFolder: row.PathFolder,
        metadataFile: row.MetadataFile,
        isSelected: row.IsSelected !== 0,
      }));
    } finally {
      db.close();
    }
  }
}

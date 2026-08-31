import { Database, constants } from "bun:sqlite";
import { pathToFileURL } from "node:url";

import { detectCapabilities, questionColumnsFor, type LegacyCapabilities } from "../domain/legacy-schema";
import type {
  LegacyLibraryContents,
  LegacyLibraryReader,
  RawLegacyOptionRow,
  RawLegacyPublicationRow,
  RawLegacyQuestionRow,
} from "../domain/legacy-library-reader";

/**
 * Leitor de uma biblioteca (`.knowchico`) individual. Mesmo padrão somente-leitura e imutável de
 * `sqlite-legacy-config-reader.ts` e `sqlite-legacy-latex-reader.ts`.
 *
 * Sem teste unitário de propósito — `bun:sqlite` não existe sob o Vitest. A cobertura real é
 * `scripts/audit-legacy-library.ts` rodando contra o acervo de verdade.
 */

const READONLY_IMMUTABLE = constants.SQLITE_OPEN_READONLY | constants.SQLITE_OPEN_URI;
const immutableUri = (filePath: string): string => `${pathToFileURL(filePath).href}?immutable=1`;

const PUBLICATION_COLUMNS = [
  "idPublication",
  "PublicationName",
  "UUID",
  "ISBN",
  "AuthorSort",
  "PublicationNick",
  "PublicationSeries",
  "Notes",
] as const;

const OPTION_COLUMNS = [
  "IdQuestao_Itens",
  "IdQuestao",
  "Ordem",
  "Marcacao",
  "Correta",
  "latexOrigin",
  "latexItem",
  "latexResposta",
] as const;

function probeCapabilities(db: InstanceType<typeof Database>): LegacyCapabilities {
  const tables = db
    .query(`SELECT name FROM sqlite_master WHERE type = 'table'`)
    .all()
    .map((row) => (row as { name: string }).name);

  const migrations = tables.includes("__EFMigrationsHistory")
    ? db
        .query(`SELECT MigrationId FROM "__EFMigrationsHistory"`)
        .all()
        .map((row) => (row as { MigrationId: string }).MigrationId)
    : null;

  const questionColumns = db.query(`PRAGMA table_info(Questao)`).all().map((row) => (row as { name: string }).name);

  return detectCapabilities({ migrations, tables, questionColumns });
}

export class SqliteLegacyLibraryReader implements LegacyLibraryReader {
  constructor(private readonly metadataPath: string) {}

  async read(): Promise<LegacyLibraryContents> {
    const db = new Database(immutableUri(this.metadataPath), READONLY_IMMUTABLE);

    try {
      const capabilities = probeCapabilities(db);
      const questionColumns = questionColumnsFor(capabilities);
      const select = questionColumns.map((column) => `"${column}"`).join(", ");

      const questions = db
        .query(`SELECT ${select} FROM Questao ORDER BY IdQuestao`)
        .all() as RawLegacyQuestionRow[];

      const optionSelect = OPTION_COLUMNS.map((column) => `"${column}"`).join(", ");
      const options = db
        .query(`SELECT ${optionSelect} FROM Questao_Itens ORDER BY IdQuestao, Ordem`)
        .all() as RawLegacyOptionRow[];

      const publicationSelect = PUBLICATION_COLUMNS.map((column) => `"${column}"`).join(", ");
      const publications = db
        .query(`SELECT ${publicationSelect} FROM Publication ORDER BY idPublication`)
        .all() as RawLegacyPublicationRow[];

      return { capabilities, publications, questions, options };
    } finally {
      db.close();
    }
  }
}

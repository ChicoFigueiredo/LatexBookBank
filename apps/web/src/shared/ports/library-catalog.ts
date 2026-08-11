/**
 * Fronteira: **catálogo de biblioteca externa**.
 *
 * A sexta, e a decisão está registrada em `docs/_atual/calibre-spike.md`. O que a justifica não é
 * "existe mais de uma implementação" — hoje existe uma, a do Calibre. É a outra metade da pergunta
 * de controle do README: **é uma fronteira arquitetural importante?**
 *
 * É. Do outro lado dela há um banco de dados de terceiro, num diretório do usuário, com esquema
 * que não controlamos e arquivos que não gravamos. Sem a fronteira, `books_authors_link` e
 * `books.path` apareceriam no caso de uso de importar livro — e a §28 do prompt do time diz o
 * contrário em três linhas: "não contaminar domínio com tabelas Calibre, IDs internos, paths
 * específicos".
 *
 * O que atravessa é `CatalogEntry`, que é vocabulário **editorial** — título, autores, editora,
 * ano. Nada aqui menciona SQLite, e é isso que faz um catálogo de outra origem (Zotero, uma pasta
 * de PDFs com metadados) ser uma implementação nova em vez de uma reescrita.
 */

export interface CatalogSummary {
  /** Quantos livros o catálogo declara. */
  readonly bookCount: number;
  /** Formatos presentes e quantos de cada — `PDF: 12`, `EPUB: 60`. */
  readonly formats: Readonly<Record<string, number>>;
}

/** Um arquivo de um livro no catálogo de origem. */
export interface CatalogFile {
  /** `PDF`, `EPUB`, `MOBI`… em maiúsculas, como o catálogo declara. */
  readonly format: string;
  readonly sizeBytes: number;
  /** Nome que o arquivo terá no acervo. **Nunca** o caminho de origem. */
  readonly filename: string;
}

/**
 * Um livro do catálogo, em vocabulário editorial.
 *
 * `externalId` é opaco de propósito: quem chama o usa para pedir o livro de volta e para detectar
 * reimportação, e não deve saber que ele é um `uuid` do Calibre.
 */
export interface CatalogEntry {
  readonly externalId: string;
  readonly title: string;
  readonly authors: readonly string[];
  readonly publisher: string | null;
  readonly year: number | null;
  readonly isbn: string | null;
  readonly language: string | null;
  readonly series: string | null;
  readonly seriesIndex: string | null;
  readonly files: readonly CatalogFile[];
  readonly hasCover: boolean;
}

/** O livro com os bytes resolvidos — é o que a importação copia para o storage gerenciado. */
export interface CatalogBook {
  readonly entry: CatalogEntry;
  /** Conteúdo de cada arquivo pedido, na ordem pedida. */
  readonly files: readonly { readonly file: CatalogFile; readonly content: Uint8Array }[];
  readonly cover: { readonly filename: string; readonly content: Uint8Array } | null;
}

export interface LibraryCatalogProvider {
  readonly id: string;
  /** Valida o catálogo e conta o que há dentro. Falha quando o lugar apontado não é um. */
  describe(): Promise<CatalogSummary>;
  list(query?: string, limit?: number): Promise<readonly CatalogEntry[]>;
  /** `null` quando o livro não está mais lá — catálogo é dado vivo do usuário. */
  read(externalId: string, formats?: readonly string[]): Promise<CatalogBook | null>;
}

export class CatalogUnavailableError extends Error {
  constructor(
    message: string,
    readonly providerId: string,
  ) {
    super(message);
    this.name = "CatalogUnavailableError";
  }
}

export class CatalogFileMissingError extends Error {
  constructor(readonly filename: string) {
    super(`O arquivo “${filename}” está no catálogo mas não no disco.`);
    this.name = "CatalogFileMissingError";
  }
}

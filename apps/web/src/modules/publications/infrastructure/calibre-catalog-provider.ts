import "server-only";

import { createClient, type Client } from "@libsql/client";
import { copyFile, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  CatalogFileMissingError,
  CatalogUnavailableError,
  type CatalogBook,
  type CatalogEntry,
  type CatalogFile,
  type CatalogSummary,
  type LibraryCatalogProvider,
} from "@/shared/ports/library-catalog";

/**
 * Lê uma biblioteca Calibre — **somente leitura, e por cópia**.
 *
 * As decisões daqui saíram da spike (`docs/_atual/calibre-spike.md`), executada contra uma
 * biblioteca real de 64 livros. As três que mais moldam o código:
 *
 * 1. **Cópia do `metadata.db` antes de abrir.** O libSQL abre o arquivo em modo leitura-escrita, e
 *    o Calibre pode estar aberto na mesma biblioteca. Corromper o catálogo do usuário para
 *    listar livros seria trocar o acervo dele por uma tela.
 * 2. **`books.path` é relativo e usa `/` em toda plataforma**, e `data.name` vem **sem extensão** —
 *    o arquivo é `<name>.<format minúsculo>`.
 * 3. **Nada do Calibre atravessa.** `books_authors_link`, `series_index` e o caminho no disco
 *    param aqui; o que sai é `CatalogEntry`.
 *
 * Segurança (§75): o caminho de cada arquivo é resolvido e conferido contra a raiz apontada. Um
 * `path` com `../` no banco — que o Calibre não produz, mas um arquivo editado à mão produz —
 * sairia do diretório do usuário, e é recusado.
 */
export class CalibreCatalogProvider implements LibraryCatalogProvider {
  readonly id = "calibre";

  constructor(private readonly root: string) {}

  async describe(): Promise<CatalogSummary> {
    return this.withCatalog(async (client) => {
      const [books, formatos] = await Promise.all([
        client.execute("select count(*) as total from books"),
        client.execute("select format, count(*) as total from data group by format"),
      ]);

      return {
        bookCount: Number(books.rows[0]?.["total"] ?? 0),
        formats: Object.fromEntries(
          formatos.rows.map((row) => [String(row["format"]), Number(row["total"] ?? 0)]),
        ),
      };
    });
  }

  async list(query = "", limit = 200): Promise<readonly CatalogEntry[]> {
    return this.withCatalog(async (client) => {
      /**
       * O filtro acontece **em memória**, e não num `like` do SQLite.
       *
       * `lower()` do SQLite só rebaixa ASCII: "TRIBUTÁRIO" vira "tributÁrio", e quem digita
       * "tributário" não acha o livro. Foi o que a primeira versão fez contra a biblioteca real —
       * o resumo dizia 64 livros e a busca devolvia zero. Um catálogo tem centenas de linhas de
       * `id, title, author_sort`; comparar isso em memória é exato e custa uma consulta de três
       * colunas.
       */
      const todos = await client.execute(
        `select id, uuid, title, author_sort, isbn, pubdate, path, has_cover, series_index
         from books order by title`,
      );

      const termo = folded(query);
      const books = {
        rows: todos.rows
          .filter(
            (row) =>
              termo === "" ||
              folded(String(row["title"] ?? "")).includes(termo) ||
              folded(String(row["author_sort"] ?? "")).includes(termo),
          )
          .slice(0, limit),
      };

      const ids = books.rows.map((row) => Number(row["id"]));
      if (ids.length === 0) return [];

      const [autores, editoras, idiomas, series, arquivos] = await Promise.all([
        this.relacionados(client, ids, "authors", "books_authors_link", "author"),
        this.relacionados(client, ids, "publishers", "books_publishers_link", "publisher"),
        this.idiomas(client, ids),
        this.relacionados(client, ids, "series", "books_series_link", "series"),
        this.arquivos(client, ids),
      ]);

      return books.rows.map((row) => {
        const id = Number(row["id"]);
        return {
          // O `uuid` e não o `id` numérico: é o que o Calibre preserva ao mover a biblioteca, e é
          // o que faz reimportar reconhecer o que já entrou.
          externalId: String(row["uuid"] ?? id),
          title: String(row["title"] ?? "").trim(),
          authors: autores.get(id) ?? [],
          publisher: editoras.get(id)?.[0] ?? null,
          year: anoDe(row["pubdate"]),
          isbn: texto(row["isbn"]),
          language: idiomas.get(id) ?? null,
          series: series.get(id)?.[0] ?? null,
          seriesIndex: indiceDeSerie(row["series_index"]),
          files: arquivos.get(id) ?? [],
          hasCover: Number(row["has_cover"] ?? 0) === 1,
        };
      });
    });
  }

  async read(externalId: string, formats?: readonly string[]): Promise<CatalogBook | null> {
    const entradas = await this.withCatalog(async (client) => {
      const linha = await client.execute({
        sql: "select id, path from books where uuid = ?1 or cast(id as text) = ?1",
        args: [externalId],
      });
      const row = linha.rows[0];
      return row ? { id: Number(row["id"]), path: String(row["path"] ?? "") } : null;
    });

    if (entradas === null) return null;

    const [entry] = (await this.list()).filter((item) => item.externalId === externalId);
    if (!entry) return null;

    const desejados =
      formats === undefined
        ? entry.files
        : entry.files.filter((file) => formats.includes(file.format));

    const files = await Promise.all(
      desejados.map(async (file) => ({
        file,
        content: await this.ler(entradas.path, file.filename),
      })),
    );

    const cover = entry.hasCover
      ? await this.ler(entradas.path, "cover.jpg")
          .then((content) => ({ filename: "cover.jpg", content }))
          .catch(() => null)
      : null;

    return { entry, files, cover };
  }

  /** Lê um arquivo do diretório do livro, recusando qualquer caminho que saia da raiz. */
  private async ler(bookPath: string, filename: string): Promise<Uint8Array> {
    const alvo = path.resolve(this.root, bookPath, filename);
    const raiz = path.resolve(this.root);

    // `path.resolve` já normaliza `..`; o que resta é confirmar que o resultado continua dentro.
    // O separador no fim evita que `/acervo-2` passe por estar dentro de `/acervo`.
    if (alvo !== raiz && !alvo.startsWith(raiz + path.sep)) {
      throw new CatalogUnavailableError(
        `O catálogo aponta para fora da biblioteca: ${filename}`,
        this.id,
      );
    }

    try {
      return new Uint8Array(await readFile(alvo));
    } catch {
      throw new CatalogFileMissingError(filename);
    }
  }

  /**
   * Abre o catálogo sobre uma **cópia** e apaga a cópia no fim.
   *
   * O `metadata.db` do usuário nunca é aberto direto. Ver a decisão 2 da spike.
   */
  private async withCatalog<T>(run: (client: Client) => Promise<T>): Promise<T> {
    const origem = path.join(this.root, "metadata.db");

    try {
      await stat(origem);
    } catch {
      throw new CatalogUnavailableError(
        "Não há `metadata.db` nesta pasta — aponte a raiz da biblioteca Calibre.",
        this.id,
      );
    }

    const temporario = await mkdtemp(path.join(tmpdir(), "lbb-calibre-"));
    const copia = path.join(temporario, "metadata.db");
    let client: Client | null = null;

    try {
      await copyFile(origem, copia);
      client = createClient({ url: `file:${copia}` });
      return await run(client);
    } catch (error) {
      if (error instanceof CatalogUnavailableError || error instanceof CatalogFileMissingError) {
        throw error;
      }
      throw new CatalogUnavailableError(
        `Não deu para ler o catálogo: ${error instanceof Error ? error.message : "erro desconhecido"}`,
        this.id,
      );
    } finally {
      client?.close();
      await rm(temporario, { recursive: true, force: true });
    }
  }

  private async relacionados(
    client: Client,
    ids: readonly number[],
    tabela: string,
    ligacao: string,
    coluna: string,
  ): Promise<Map<number, string[]>> {
    // Os nomes de tabela vêm de literais deste arquivo, nunca de entrada do usuário — o que é
    // interpolado é o esquema fixo do Calibre. Os **ids** vão como parâmetro.
    const marcadores = ids.map((_, index) => `?${index + 1}`).join(",");
    const resultado = await client.execute({
      sql: `select l.book as book, t.name as name
            from ${ligacao} l join ${tabela} t on t.id = l.${coluna}
            where l.book in (${marcadores})
            order by l.id`,
      args: [...ids],
    });

    const mapa = new Map<number, string[]>();
    for (const row of resultado.rows) {
      const book = Number(row["book"]);
      const nome = texto(row["name"]);
      if (nome === null) continue;

      const lista = mapa.get(book);
      if (lista) lista.push(nome);
      else mapa.set(book, [nome]);
    }
    return mapa;
  }

  private async idiomas(client: Client, ids: readonly number[]): Promise<Map<number, string>> {
    const marcadores = ids.map((_, index) => `?${index + 1}`).join(",");
    const resultado = await client.execute({
      sql: `select l.book as book, g.lang_code as code
            from books_languages_link l join languages g on g.id = l.lang_code
            where l.book in (${marcadores})
            order by l.item_order`,
      args: [...ids],
    });

    const mapa = new Map<number, string>();
    for (const row of resultado.rows) {
      const book = Number(row["book"]);
      if (!mapa.has(book)) {
        const code = texto(row["code"]);
        if (code !== null) mapa.set(book, code);
      }
    }
    return mapa;
  }

  private async arquivos(
    client: Client,
    ids: readonly number[],
  ): Promise<Map<number, CatalogFile[]>> {
    const marcadores = ids.map((_, index) => `?${index + 1}`).join(",");
    const resultado = await client.execute({
      sql: `select book, format, name, uncompressed_size
            from data where book in (${marcadores}) order by format`,
      args: [...ids],
    });

    const mapa = new Map<number, CatalogFile[]>();
    for (const row of resultado.rows) {
      const book = Number(row["book"]);
      const format = String(row["format"] ?? "").toUpperCase();
      const name = texto(row["name"]);
      if (name === null || format === "") continue;

      // O arquivo no disco é `<name>.<format minúsculo>` — `data.name` vem sem extensão.
      const file: CatalogFile = {
        format,
        filename: `${name}.${format.toLowerCase()}`,
        sizeBytes: Number(row["uncompressed_size"] ?? 0),
      };

      const lista = mapa.get(book);
      if (lista) lista.push(file);
      else mapa.set(book, [file]);
    }
    return mapa;
  }
}

/**
 * Texto comparável: sem acento, sem caixa, sem espaço nas pontas.
 *
 * `toLocaleLowerCase` e não `toLowerCase` porque a comparação é sobre títulos em português — e
 * `NFD` antes de remover diacrítico, senão "Matemática" perderia o caractere inteiro em vez de só
 * o acento.
 */
const folded = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();

const texto = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const limpo = value.trim();
  return limpo === "" ? null : limpo;
};

/**
 * O ano de `pubdate`.
 *
 * O Calibre grava `0101-01-01` para "sem data" — o ano 101 —, e importar isso como ano de
 * publicação encheria o acervo de livros do século II. Abaixo de 1450 vira `null`.
 */
function anoDe(value: unknown): number | null {
  const texto = typeof value === "string" ? value : null;
  if (texto === null) return null;

  const ano = Number(texto.slice(0, 4));
  return Number.isInteger(ano) && ano >= 1450 ? ano : null;
}

/** `series_index` é `1.0` no banco; o volume editorial é "1". */
function indiceDeSerie(value: unknown): string | null {
  const numero = Number(value);
  if (!Number.isFinite(numero) || numero === 0) return null;

  return Number.isInteger(numero) ? String(numero) : String(numero);
}

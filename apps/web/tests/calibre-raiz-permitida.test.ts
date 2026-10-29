import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createClient } from "@libsql/client";

import { CalibreCatalogProvider } from "@modules/publications/infrastructure/calibre-catalog-provider";
import { CatalogUnavailableError } from "@/shared/ports/library-catalog";
import { resetEnvCache } from "@/shared/config/env";

/**
 * A raiz do Calibre é do servidor, e não do corpo da requisição (#256, SEC-05 da revisão).
 *
 * `CALIBRE_LIBRARY_ROOT` era só o valor inicial da tela: o servidor abria o `metadata.db` de
 * qualquer pasta absoluta que o cliente mandasse, seguia symlink para fora da biblioteca e
 * devolvia o erro cru do libSQL — um oráculo de que arquivo existe onde.
 */

let base = "";
let permitida = "";
let alheia = "";

/** O mínimo do esquema do Calibre que `describe` e `read` consultam. */
async function biblioteca(dir: string, livro: { path: string; arquivo: string }) {
  await mkdir(dir, { recursive: true });
  const client = createClient({ url: `file:${path.join(dir, "metadata.db")}` });
  for (const sql of [
    `create table books (id integer primary key, title text, sort text, timestamp text,
      pubdate text, series_index real default 1.0, author_sort text, lccn text,
      path text, flags integer, uuid text, has_cover bool, last_modified text)`,
    `create table identifiers (id integer primary key, book integer, type text, val text)`,
    `create table authors (id integer primary key, name text, sort text, link text)`,
    `create table books_authors_link (id integer primary key, book integer, author integer)`,
    `create table publishers (id integer primary key, name text, sort text)`,
    `create table books_publishers_link (id integer primary key, book integer, publisher integer)`,
    `create table series (id integer primary key, name text, sort text)`,
    `create table books_series_link (id integer primary key, book integer, series integer)`,
    `create table languages (id integer primary key, lang_code text)`,
    `create table books_languages_link (id integer primary key, book integer, lang_code integer,
      item_order integer default 0)`,
    `create table data (id integer primary key, book integer, format text,
      uncompressed_size integer, name text)`,
    `insert into books (id, title, path, uuid, has_cover) values (1, 'Livro', '${livro.path}', 'uuid-1', 0)`,
    `insert into data (book, format, uncompressed_size, name) values (1, 'PDF', 1, '${livro.arquivo}')`,
  ]) {
    await client.execute(sql);
  }
  client.close();
}

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), "lbb-calibre-raiz-"));
  permitida = path.join(base, "Livros");
  alheia = path.join(base, "fora");

  await biblioteca(permitida, { path: "Autor/Livro (1)", arquivo: "livro" });
  await mkdir(path.join(permitida, "Autor", "Livro (1)"), { recursive: true });
  await writeFile(path.join(permitida, "Autor", "Livro (1)", "livro.pdf"), "%PDF-1.4 dentro");

  await biblioteca(alheia, { path: "Autor/Livro (1)", arquivo: "livro" });
  await mkdir(path.join(alheia, "Autor", "Livro (1)"), { recursive: true });
  await writeFile(path.join(alheia, "Autor", "Livro (1)", "livro.pdf"), "%PDF-1.4 fora");
  await writeFile(path.join(base, "segredo.pdf"), "%PDF-1.4 segredo");

  // Um livro dentro da biblioteca permitida cujo arquivo é um symlink para fora dela.
  await biblioteca(path.join(permitida, "com-atalho"), { path: "Atalho", arquivo: "livro" });
  await mkdir(path.join(permitida, "com-atalho", "Atalho"), { recursive: true });
  await symlink(
    path.join(base, "segredo.pdf"),
    path.join(permitida, "com-atalho", "Atalho", "livro.pdf"),
  );

  // E uma pasta dentro da permitida que é, ela mesma, um atalho para a biblioteca de fora.
  await symlink(alheia, path.join(permitida, "atalho-para-fora"));
});

afterAll(async () => {
  if (base !== "") await rm(base, { recursive: true, force: true });
});

beforeEach(() => {
  process.env["DATABASE_URL"] ??= `file:${path.join(base, "nao-usado.db")}`;
  process.env["CALIBRE_LIBRARY_ROOT"] = permitida;
  resetEnvCache();
});

type Rota = "catalog" | "catalog/import";

/** As rotas são importadas depois do ambiente: o cliente Prisma lê `DATABASE_URL` ao carregar. */
async function pedir(rota: Rota, body: Record<string, unknown>): Promise<Response> {
  const { POST } =
    rota === "catalog"
      ? await import("../app/api/catalog/route")
      : await import("../app/api/catalog/import/route");
  return POST(
    new Request(`http://127.0.0.1:28080/api/${rota}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("a raiz do Calibre é a do servidor", () => {
  it("abre a biblioteca configurada", async () => {
    const response = await pedir("catalog", { path: permitida });
    expect(response.status).toBe(200);
  });

  it("recusa uma pasta fora da raiz configurada, exista ela ou não", async () => {
    const existe = await pedir("catalog", { path: alheia });
    const naoExiste = await pedir("catalog", { path: path.join(base, "nada") });

    expect(existe.status).toBe(403);
    // A mesma resposta para as duas: a diferença diria a quem pergunta o que há no disco.
    expect(await naoExiste.json()).toEqual(await existe.json());
  });

  it("recusa a pasta que fica dentro da raiz só pelo nome, e é um atalho para fora", async () => {
    const response = await pedir("catalog", { path: path.join(permitida, "atalho-para-fora") });
    expect(response.status).toBe(403);
  });

  it("sem raiz configurada, o servidor não abre catálogo nenhum", async () => {
    delete process.env["CALIBRE_LIBRARY_ROOT"];
    resetEnvCache();

    const response = await pedir("catalog", { path: permitida });
    expect(response.status).toBe(403);
  });

  it("a importação também recusa a pasta de fora, antes de ler qualquer coisa", async () => {
    const response = await pedir("catalog/import", {
      path: alheia,
      libraryId: "qualquer",
      externalId: "uuid-1",
    });
    expect(response.status).toBe(403);
  });
});

describe("o arquivo lido continua dentro da biblioteca", () => {
  it("não segue o symlink que aponta para fora", async () => {
    await expect(
      new CalibreCatalogProvider(path.join(permitida, "com-atalho")).read("uuid-1", ["PDF"]),
    ).rejects.toThrow(CatalogUnavailableError);
  });

  it("o erro do banco não vai para a resposta", async () => {
    const quebrada = path.join(permitida, "quebrada");
    await mkdir(quebrada, { recursive: true });
    await writeFile(path.join(quebrada, "metadata.db"), "isto não é um SQLite");

    const response = await pedir("catalog", { path: quebrada });
    const body = (await response.json()) as { message: string };

    expect(response.status).toBe(422);
    expect(body.message).toBe("Não deu para ler o catálogo desta pasta.");
  });
});

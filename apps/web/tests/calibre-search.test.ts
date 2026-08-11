import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createClient } from "@libsql/client";

import { CalibreCatalogProvider } from "@modules/publications/infrastructure/calibre-catalog-provider";

/**
 * A busca do catálogo **acha acento**.
 *
 * O defeito que este arquivo fixa apareceu contra a biblioteca real, não contra fixture: o resumo
 * dizia 64 livros e procurar "tributário" devolvia zero. A causa é o `lower()` do SQLite, que só
 * rebaixa ASCII — "TRIBUTÁRIO" vira "tributÁrio" e o `like` não casa.
 *
 * O acervo é em português. Uma busca que só funciona sem acento é uma busca que não funciona.
 */

let root = "";

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "lbb-calibre-busca-"));

  const client = createClient({ url: `file:${path.join(root, "metadata.db")}` });
  for (const sql of [
    `create table books (id integer primary key, title text, sort text, timestamp text,
      pubdate text, series_index real default 1.0, author_sort text, isbn text, lccn text,
      path text, flags integer, uuid text, has_cover bool, last_modified text)`,
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
    // Maiúsculas com acento: exatamente como o título vem no acervo real.
    `insert into books (id, title, author_sort, path, uuid, has_cover)
     values (1, 'MANUAL DE DIREITO TRIBUTÁRIO - 5ª Edição', 'SABBAG, EDUARDO', 'x/y (1)', 'u1', 0),
            (2, 'A Música dos Números Primos', 'Sautoy, Marcus du', 'x/z (2)', 'u2', 0)`,
  ]) {
    await client.execute(sql);
  }
  client.close();
});

afterAll(async () => {
  if (root !== "") await rm(root, { recursive: true, force: true });
});

const titulos = async (query: string): Promise<string[]> =>
  (await new CalibreCatalogProvider(root).list(query)).map((entry) => entry.title);

describe("a busca no catálogo", () => {
  it("acha título em maiúsculas acentuadas — o caso que quebrou contra o acervo real", async () => {
    expect(await titulos("tributário")).toEqual([
      "MANUAL DE DIREITO TRIBUTÁRIO - 5ª Edição",
    ]);
  });

  it("acha também quem digita sem acento", async () => {
    // Os dois lados são normalizados: quem digita "musica" acha "Música", e vice-versa.
    expect(await titulos("musica")).toEqual(["A Música dos Números Primos"]);
    expect(await titulos("Música")).toEqual(["A Música dos Números Primos"]);
  });

  it("acha por autor", async () => {
    expect(await titulos("sabbag")).toHaveLength(1);
  });

  it("busca vazia devolve tudo", async () => {
    expect(await titulos("")).toHaveLength(2);
  });
});

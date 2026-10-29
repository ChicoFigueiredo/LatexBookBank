import path from "node:path";

import { createClient, type InStatement } from "@libsql/client";

/**
 * O `metadata.db` do Calibre **de hoje**, para os testes de unidade e para o E2E.
 *
 * O schema é o `user_version` 27, conferido contra as duas bibliotecas reais desta máquina:
 * `books` **não tem** coluna `isbn`, e identificador vive em `identifiers`. Só as colunas que o
 * produto lê estão aqui; construir o esquema deixa explícito do que o produto depende, e copiar a
 * biblioteca do usuário versionaria o acervo dele.
 *
 * Um arquivo só, e não uma cópia por teste: o E2E guardou o schema antigo (com `books.isbn`, sem
 * `identifiers`) depois que o provider passou a ler `identifiers`, e o fluxo do Calibre ficou
 * vermelho com `no such table: identifiers` sem ninguém notar (TST-09 da revisão de 2026-09-23).
 */
export const CALIBRE_SCHEMA: readonly string[] = [
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
  `pragma user_version = 27`,
];

/** Grava `<root>/metadata.db` com o schema 27 e as linhas que o teste pede. */
export async function writeCalibreMetadata(
  root: string,
  seed: readonly InStatement[],
): Promise<void> {
  const client = createClient({ url: `file:${path.join(root, "metadata.db")}` });
  try {
    for (const statement of [...CALIBRE_SCHEMA, ...seed]) await client.execute(statement);
  } finally {
    client.close();
  }
}

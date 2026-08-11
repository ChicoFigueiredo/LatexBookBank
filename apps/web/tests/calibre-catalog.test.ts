import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createClient } from "@libsql/client";

import { CalibreCatalogProvider } from "@modules/publications/infrastructure/calibre-catalog-provider";
import { CatalogUnavailableError } from "@/shared/ports/library-catalog";

/**
 * Contract test da sexta fronteira (§44): o adaptador do Calibre.
 *
 * A fixture é um `metadata.db` **construído aqui**, com o esquema real que a spike leu numa
 * biblioteca de 64 livros. Copiar o banco do usuário para o repositório versionaria o acervo dele;
 * construir o esquema deixa explícito **o que** deste esquema o produto depende — e é isso que
 * quebra ruidosamente se o Calibre mudar.
 *
 * O que os testes fixam é o que a spike decidiu: `path` relativo com `/`, `data.name` sem
 * extensão, `pubdate` do ano 101 como "sem data", e a recusa de caminho que sai da raiz.
 */

let root = "";

const SCHEMA = [
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
];

const SEED = [
  `insert into authors (id, name) values (1, 'Iezzi, Gelson'), (2, 'Murakami, Carlos'),
    (3, 'Sautoy, Marcus du')`,
  `insert into publishers (id, name) values (1, 'Atual'), (2, 'Zahar')`,
  `insert into series (id, name) values (1, 'Fundamentos de Matemática Elementar')`,
  `insert into languages (id, lang_code) values (1, 'por'), (2, 'eng')`,

  `insert into books (id, title, author_sort, isbn, pubdate, path, uuid, has_cover, series_index)
   values (1, 'Conjuntos e Funções', 'Iezzi, Gelson', '9783161484100', '2013-01-27 02:00:00+00:00',
           'Gelson Iezzi/Conjuntos e Funcoes (1)', 'uuid-livro-1', 1, 1.0)`,
  `insert into books (id, title, author_sort, isbn, pubdate, path, uuid, has_cover, series_index)
   values (2, 'A Música dos Números Primos', 'Sautoy, Marcus du', null,
           '0101-01-01 00:00:00+00:00', 'Marcus du Sautoy/A Musica (2)', 'uuid-livro-2', 0, 1.0)`,

  `insert into books_authors_link (book, author) values (1, 1), (1, 2), (2, 3)`,
  `insert into books_publishers_link (book, publisher) values (1, 1), (2, 2)`,
  `insert into books_series_link (book, series) values (1, 1)`,
  `insert into books_languages_link (book, lang_code, item_order) values (1, 1, 0), (2, 2, 0)`,

  // `data.name` **sem extensão** — o arquivo real é `<name>.<format minúsculo>`.
  `insert into data (book, format, uncompressed_size, name)
   values (1, 'PDF', 9362270, 'Conjuntos e Funcoes - Gelson Iezzi'),
          (1, 'EPUB', 812345, 'Conjuntos e Funcoes - Gelson Iezzi'),
          (2, 'EPUB', 512345, 'A Musica - Marcus du Sautoy')`,
];

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "lbb-calibre-fixture-"));

  const client = createClient({ url: `file:${path.join(root, "metadata.db")}` });
  for (const sql of [...SCHEMA, ...SEED]) await client.execute(sql);
  client.close();

  const livro1 = path.join(root, "Gelson Iezzi", "Conjuntos e Funcoes (1)");
  await mkdir(livro1, { recursive: true });
  await writeFile(path.join(livro1, "Conjuntos e Funcoes - Gelson Iezzi.pdf"), "%PDF-1.4 fake");
  await writeFile(path.join(livro1, "cover.jpg"), "jpeg-fake");

  const livro2 = path.join(root, "Marcus du Sautoy", "A Musica (2)");
  await mkdir(livro2, { recursive: true });
  await writeFile(path.join(livro2, "A Musica - Marcus du Sautoy.epub"), "epub-fake");
});

afterAll(async () => {
  if (root !== "") await rm(root, { recursive: true, force: true });
});

describe("o catálogo do Calibre", () => {
  it("descreve o que há dentro sem carregar nada", async () => {
    const summary = await new CalibreCatalogProvider(root).describe();

    expect(summary.bookCount).toBe(2);
    expect(summary.formats).toEqual({ PDF: 1, EPUB: 2 });
  });

  it("recusa uma pasta que não é biblioteca, dizendo o que falta", async () => {
    await expect(new CalibreCatalogProvider(path.join(root, "Gelson Iezzi")).describe()).rejects.toThrow(
      CatalogUnavailableError,
    );
  });

  it("traduz o livro para vocabulário editorial", async () => {
    const [primeiro] = await new CalibreCatalogProvider(root).list("conjuntos");

    expect(primeiro).toMatchObject({
      externalId: "uuid-livro-1",
      title: "Conjuntos e Funções",
      publisher: "Atual",
      year: 2013,
      isbn: "9783161484100",
      language: "por",
      series: "Fundamentos de Matemática Elementar",
      hasCover: true,
    });
    // A ordem dos autores é dado editorial, e vem da tabela de ligação.
    expect(primeiro?.authors).toEqual(["Iezzi, Gelson", "Murakami, Carlos"]);
  });

  it("monta o nome do arquivo com a extensão que `data.name` não traz", async () => {
    const [primeiro] = await new CalibreCatalogProvider(root).list("conjuntos");

    expect(primeiro?.files.map((file) => file.filename).sort()).toEqual([
      "Conjuntos e Funcoes - Gelson Iezzi.epub",
      "Conjuntos e Funcoes - Gelson Iezzi.pdf",
    ]);
  });

  it("trata o ano 101 do Calibre como **sem data**", async () => {
    // `0101-01-01` é o "sem data" do Calibre. Importado literalmente, encheria o acervo de livros
    // do século II.
    const [segundo] = await new CalibreCatalogProvider(root).list("música");
    expect(segundo?.year).toBeNull();
  });

  it("pesquisa por autor, não só por título", async () => {
    const achados = await new CalibreCatalogProvider(root).list("sautoy");
    expect(achados.map((entry) => entry.title)).toEqual(["A Música dos Números Primos"]);
  });

  it("lê os bytes do formato pedido, e só dele", async () => {
    const livro = await new CalibreCatalogProvider(root).read("uuid-livro-1", ["PDF"]);

    expect(livro?.files).toHaveLength(1);
    expect(livro?.files[0]?.file.format).toBe("PDF");
    expect(new TextDecoder().decode(livro?.files[0]?.content)).toContain("%PDF");
    expect(new TextDecoder().decode(livro?.cover?.content)).toBe("jpeg-fake");
  });

  it("livro sem capa não inventa capa", async () => {
    const livro = await new CalibreCatalogProvider(root).read("uuid-livro-2", ["EPUB"]);
    expect(livro?.cover).toBeNull();
  });

  it("devolve `null` para um livro que não está mais lá", async () => {
    expect(await new CalibreCatalogProvider(root).read("uuid-que-nao-existe")).toBeNull();
  });

  it("**recusa caminho que sai da biblioteca**", async () => {
    // O `books.path` vem de um arquivo que o produto não controla. Um `../` ali leria fora do
    // diretório apontado — e é a única entrada deste módulo que vira acesso a disco (§75).
    const cliente = createClient({ url: `file:${path.join(root, "metadata.db")}` });
    await cliente.execute(
      `insert into books (id, title, path, uuid, has_cover) values (9, 'Fuga', '../../..', 'uuid-fuga', 0)`,
    );
    await cliente.execute(
      `insert into data (book, format, uncompressed_size, name) values (9, 'PDF', 1, 'etc/passwd')`,
    );
    cliente.close();

    await expect(new CalibreCatalogProvider(root).read("uuid-fuga", ["PDF"])).rejects.toThrow(
      CatalogUnavailableError,
    );
  });
});

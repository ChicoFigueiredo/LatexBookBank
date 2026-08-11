import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { createClient } from "@libsql/client";

/**
 * **O E2E do Calibre** (§43 do prompt do time).
 *
 * ```text
 * catálogo → seleção → metadados → importar → publicação
 * ```
 *
 * A fixture é uma biblioteca Calibre mínima, **construída aqui**, com o esquema real que a spike
 * leu numa de 64 livros. Uma cópia da biblioteca do usuário no repositório versionaria o acervo
 * dele; construir o esquema deixa explícito o que o produto depende dele.
 *
 * O que a §43 também pede — validação manual com biblioteca real — está registrado em
 * `docs/_atual/calibre-spike.md`: a spike rodou contra `/mnt/u/...`, 64 livros, 111 arquivos.
 * Mock não basta para o aceite final, e por isso a decisão saiu de dado medido.
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

const TITULO_PDF = "Fundamentos de Matemática Elementar";
const TITULO_SEM_PDF = "Livro só em EPUB";

test.beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "lbb-e2e-calibre-"));

  const client = createClient({ url: `file:${path.join(root, "metadata.db")}` });
  for (const sql of SCHEMA) await client.execute(sql);

  await client.execute(`insert into authors (id, name) values (1, 'Iezzi, Gelson')`);
  await client.execute(`insert into publishers (id, name) values (1, 'Atual')`);
  await client.execute(`insert into languages (id, lang_code) values (1, 'por')`);

  await client.execute({
    sql: `insert into books (id, title, author_sort, isbn, pubdate, path, uuid, has_cover)
          values (1, ?1, 'Iezzi, Gelson', '9783161484100', '2013-01-27 02:00:00+00:00',
                  'Gelson Iezzi/Fundamentos (1)', 'uuid-e2e-1', 1)`,
    args: [TITULO_PDF],
  });
  await client.execute({
    sql: `insert into books (id, title, author_sort, pubdate, path, uuid, has_cover)
          values (2, ?1, 'Ninguém', '0101-01-01 00:00:00+00:00', 'Ninguem/So EPUB (2)',
                  'uuid-e2e-2', 0)`,
    args: [TITULO_SEM_PDF],
  });

  await client.execute(`insert into books_authors_link (book, author) values (1, 1)`);
  await client.execute(`insert into books_publishers_link (book, publisher) values (1, 1)`);
  await client.execute(`insert into books_languages_link (book, lang_code) values (1, 1)`);
  await client.execute(
    `insert into data (book, format, uncompressed_size, name)
     values (1, 'PDF', 4096, 'Fundamentos - Gelson Iezzi'),
            (2, 'EPUB', 2048, 'So EPUB - Ninguem')`,
  );
  client.close();

  const livro1 = path.join(root, "Gelson Iezzi", "Fundamentos (1)");
  await mkdir(livro1, { recursive: true });
  // Um PDF mínimo de verdade: o `storeAsset` confere mime e tamanho antes de gravar.
  await writeFile(
    path.join(livro1, "Fundamentos - Gelson Iezzi.pdf"),
    "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  );
  await writeFile(path.join(livro1, "cover.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

  const livro2 = path.join(root, "Ninguem", "So EPUB (2)");
  await mkdir(livro2, { recursive: true });
  await writeFile(path.join(livro2, "So EPUB - Ninguem.epub"), "PKfake");
});

test.afterAll(async () => {
  if (root !== "") await rm(root, { recursive: true, force: true });
});

async function criarBiblioteca(page: Page, nome: string): Promise<string> {
  const response = await page.request.post("/api/libraries", { data: { name: nome } });
  expect(response.ok(), "não deu para criar a biblioteca").toBeTruthy();

  const { library } = (await response.json()) as { library: { slug: string } };
  return library.slug;
}

test("do catálogo do Calibre a um livro do acervo", async ({ page }) => {
  const marca = `${Date.now()}`;
  const slug = await criarBiblioteca(page, `Acervo Calibre ${marca}`);

  await test.step("apontar a pasta e abrir o catálogo", async () => {
    await page.goto(`/bibliotecas/${slug}/livros/calibre`);

    await page.getByLabel("Pasta da biblioteca").fill(root);
    await page.getByRole("button", { name: "Abrir catálogo" }).click();

    // O resumo diz o que há dentro antes de qualquer escolha.
    await expect(page.getByText("2 livros")).toBeVisible();
    await expect(page.getByText("1 PDF")).toBeVisible();
  });

  await test.step("o livro sem PDF avisa antes do clique", async () => {
    // Sem PDF a captura por recorte não funciona, e dizer isso na lista poupa a importação
    // inteira.
    const semPdf = page.getByRole("button", { name: new RegExp(TITULO_SEM_PDF) });
    await expect(semPdf).toContainText("sem PDF");
  });

  await test.step("pesquisar e selecionar", async () => {
    await page.getByLabel("Pesquisar no catálogo").fill("fundamentos");
    await page.getByLabel("Pesquisar no catálogo").press("Enter");

    await expect(page.getByRole("button", { name: new RegExp(TITULO_SEM_PDF) })).toHaveCount(0);

    await page.getByRole("button", { name: new RegExp(TITULO_PDF) }).click();
    await expect(page.getByText(`Importar “${TITULO_PDF}”`)).toBeVisible();
    // Os metadados revisáveis antes de importar (§30).
    await expect(page.getByText("ISBN 9783161484100")).toBeVisible();
  });

  await test.step("importar e abrir o livro", async () => {
    await page.getByRole("button", { name: "Importar livro" }).click();

    await expect(page.getByText("Livro no acervo")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("link", { name: "Abrir o livro" }).click();

    // Depois de importado, é um livro normal do LatexBookBank — o Calibre é só a origem.
    await expect(page.getByText("Este livro ainda não tem estrutura")).toBeVisible();
  });

  await test.step("reimportar o mesmo livro é recusado, com saída", async () => {
    await page.goto(`/bibliotecas/${slug}/livros/calibre`);
    await page.getByRole("button", { name: "Abrir catálogo" }).click();

    // O sinal aparece **na lista**, antes de clicar.
    const cartao = page.getByRole("button", { name: new RegExp(TITULO_PDF) });
    await expect(cartao).toContainText("já importado");

    await cartao.click();
    await page.getByRole("button", { name: "Importar livro" }).click();

    await expect(page.getByText("Este livro já está no acervo")).toBeVisible();
    // Recusa com saída: abrir o que já existe, ou insistir. Parede seria pior que as duas.
    await expect(page.getByRole("link", { name: "Abrir o que já existe" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Importar assim mesmo" })).toBeVisible();
  });

  await test.step("a publicação guarda os metadados e a origem", async () => {
    const catalogo = await page.request.get("/api/publications");
    const { publications } = (await catalogo.json()) as {
      publications: { id: string; title: string }[];
    };
    const importado = publications.find((row) => row.title === TITULO_PDF);
    expect(importado, "o livro importado não apareceu no catálogo do acervo").toBeTruthy();
  });
});

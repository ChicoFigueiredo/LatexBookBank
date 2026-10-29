import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CalibreCatalogProvider } from "@modules/publications/infrastructure/calibre-catalog-provider";

import { writeCalibreMetadata } from "./support/calibre-library";

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

  // Schema do Calibre de hoje (`user_version` 27): sem `books.isbn`, com `identifiers`.
  await writeCalibreMetadata(root, [
    // Maiúsculas com acento: exatamente como o título vem no acervo real.
    `insert into books (id, title, author_sort, path, uuid, has_cover)
     values (1, 'MANUAL DE DIREITO TRIBUTÁRIO - 5ª Edição', 'SABBAG, EDUARDO', 'x/y (1)', 'u1', 0),
            (2, 'A Música dos Números Primos', 'Sautoy, Marcus du', 'x/z (2)', 'u2', 0)`,
  ]);
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

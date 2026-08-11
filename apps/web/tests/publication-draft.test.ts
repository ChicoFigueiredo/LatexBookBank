import { describe, expect, it } from "vitest";

import {
  InvalidPublicationError,
  parsePublicationDraft,
} from "@modules/publications/domain/publication-draft";

/**
 * Cadastro manual de livro — o formulário que precisa deixar começar com pouco.
 *
 * A regra do design é "não tornar tudo obrigatório", e é isso que o primeiro teste fixa: só o
 * título. O resto dos testes protege o contrário — o que **é** dado precisa ser dado de verdade,
 * porque um ISBN errado só aparece quando alguém procura o livro por ele.
 */

const MAX_YEAR = 2027;

describe("o rascunho da publicação", () => {
  it("aceita só o título", () => {
    const draft = parsePublicationDraft({ title: "Fundamentos" }, MAX_YEAR);

    expect(draft.title).toBe("Fundamentos");
    expect(draft.authors).toEqual([]);
    expect(draft.publisher).toBeNull();
    expect(draft.isbn).toBeNull();
  });

  it("exige o título", () => {
    expect(() => parsePublicationDraft({ title: "   " }, MAX_YEAR)).toThrow(InvalidPublicationError);
    expect(() => parsePublicationDraft({}, MAX_YEAR)).toThrow(InvalidPublicationError);
  });

  it("nomeia o campo do erro, para a UI marcar o input", () => {
    // Sem isto, o formulário só saberia mostrar um banner genérico e o autor teria que adivinhar
    // qual dos onze campos está errado.
    try {
      parsePublicationDraft({ title: "Livro", editionYear: 1200 }, MAX_YEAR);
      expect.unreachable("deveria ter recusado o ano");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidPublicationError);
      expect((error as InvalidPublicationError).field).toBe("editionYear");
    }
  });

  it("trata vazio como ausente, não como texto vazio", () => {
    const draft = parsePublicationDraft({ title: "Livro", publisher: "  " }, MAX_YEAR);
    expect(draft.publisher).toBeNull();
  });
});

describe("os autores", () => {
  it("preservam a ordem digitada — o crédito é ordenado", () => {
    const draft = parsePublicationDraft(
      { title: "Livro", authors: "Iezzi, Gelson; Murakami, Carlos" },
      MAX_YEAR,
    );

    expect(draft.authors).toEqual(["Iezzi, Gelson", "Murakami, Carlos"]);
  });

  it("descartam repetição, ignorando caixa", () => {
    const draft = parsePublicationDraft({ title: "Livro", authors: ["Silva", "SILVA"] }, MAX_YEAR);
    expect(draft.authors).toEqual(["Silva"]);
  });
});

describe("o ISBN", () => {
  it("normaliza hífen e espaço", () => {
    // ISBN-13 real de domínio bibliográfico comum; o dígito verificador fecha.
    const draft = parsePublicationDraft({ title: "Livro", isbn: "978-3-16-148410-0" }, MAX_YEAR);
    expect(draft.isbn).toBe("9783161484100");
  });

  it("aceita ISBN-10 com X de verificador", () => {
    const draft = parsePublicationDraft({ title: "Livro", isbn: "0-8044-2957-X" }, MAX_YEAR);
    expect(draft.isbn).toBe("080442957X");
  });

  it("recusa dígito verificador errado", () => {
    // O caso que importa: 13 dígitos, formato certo, número errado. Sem conferir o verificador,
    // isto entraria no acervo e só falharia meses depois, na busca.
    expect(() => parsePublicationDraft({ title: "Livro", isbn: "9783161484101" }, MAX_YEAR)).toThrow(
      InvalidPublicationError,
    );
  });
});

describe("o ano", () => {
  it("aceita texto numérico do formulário", () => {
    expect(parsePublicationDraft({ title: "Livro", editionYear: "2013" }, MAX_YEAR).editionYear).toBe(
      2013,
    );
  });

  it("recusa ano no futuro além do razoável", () => {
    expect(() =>
      parsePublicationDraft({ title: "Livro", editionYear: MAX_YEAR + 1 }, MAX_YEAR),
    ).toThrow(InvalidPublicationError);
  });

  it("aceita vazio", () => {
    expect(parsePublicationDraft({ title: "Livro", editionYear: "" }, MAX_YEAR).editionYear).toBeNull();
  });
});

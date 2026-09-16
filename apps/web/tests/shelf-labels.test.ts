import { describe, expect, it } from "vitest";

import {
  carimboDaLombada,
  formatarAutores,
  formatarEdicao,
  sobrenome,
} from "@modules/publications/domain/shelf-labels";

/**
 * A estante mostra o autor numa coluna de 8,5rem, e o nome que ela recebe vem de duas origens com
 * convenções opostas. É o tipo de regra que erra em silêncio: a coluna fica preenchida, legível e
 * errada.
 */

describe("o sobrenome do autor", () => {
  it("entende o formato do Calibre, com o sobrenome primeiro", () => {
    // Foi o defeito real: a estante mostrava "Gelson e Carlos" para Iezzi e Murakami — o primeiro
    // nome de duas pessoas diferentes, que não identifica nenhuma das duas.
    expect(sobrenome("Iezzi, Gelson")).toBe("Iezzi");
    expect(sobrenome("Murakami, Carlos")).toBe("Murakami");
  });

  it("entende o formato de quem digita à mão", () => {
    expect(sobrenome("Gelson Iezzi")).toBe("Iezzi");
    expect(sobrenome("Renato Brito")).toBe("Brito");
  });

  it("aguenta nome de uma palavra só, espaço sobrando e vazio", () => {
    expect(sobrenome("Euclides")).toBe("Euclides");
    expect(sobrenome("  Gelson   Iezzi  ")).toBe("Iezzi");
    expect(sobrenome("   ")).toBe("");
  });
});

describe("a lista de autores", () => {
  it("junta dois com “e”, e resume três ou mais", () => {
    expect(formatarAutores(["Iezzi, Gelson"])).toBe("Iezzi");
    expect(formatarAutores(["Iezzi, Gelson", "Murakami, Carlos"])).toBe("Iezzi e Murakami");
    expect(formatarAutores(["Iezzi, Gelson", "Murakami, Carlos", "Dolce, Osvaldo"])).toBe(
      "Iezzi e outros",
    );
  });

  it("devolve `null` quando não há autor — a coluna mostra um traço, não “undefined”", () => {
    expect(formatarAutores([])).toBeNull();
    expect(formatarAutores(["   "])).toBeNull();
  });
});

describe("a edição", () => {
  it("junta o que existe e omite o que não", () => {
    expect(formatarEdicao("3ª ed.", 2021)).toBe("3ª ed., 2021");
    expect(formatarEdicao("3ª ed.", null)).toBe("3ª ed.");
    expect(formatarEdicao(null, 2021)).toBe("2021");
    expect(formatarEdicao(null, null)).toBeNull();
    expect(formatarEdicao("   ", null)).toBeNull();
  });
});

describe("o carimbo da lombada", () => {
  it("prefere o volume e cai na inicial do título", () => {
    expect(carimboDaLombada("Fundamentos de Matemática Elementar", "1")).toBe("1");
    expect(carimboDaLombada("Fundamentos de Matemática Elementar", null)).toBe("F");
    expect(carimboDaLombada("fundamentos", "  ")).toBe("F");
  });
});

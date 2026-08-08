import { describe, expect, it } from "vitest";

import { countTags, matchesAllTags } from "@modules/questions/domain/tag-filter";

describe("matchesAllTags", () => {
  it("sem seleção, tudo passa", () => {
    expect(matchesAllTags(["álgebra"], [])).toBe(true);
    expect(matchesAllTags([], [])).toBe(true);
  });

  it("**todas**, não qualquer uma", () => {
    // Selecionar duas tags é o gesto de estreitar a busca. Com "ou", a segunda ampliaria o
    // resultado — o contrário do que a pessoa acabou de pedir.
    expect(matchesAllTags(["álgebra", "funções"], ["álgebra", "funções"])).toBe(true);
    expect(matchesAllTags(["álgebra"], ["álgebra", "funções"])).toBe(false);
  });

  it("compara pela chave — filtrar por `funcao` encontra `Função`", () => {
    expect(matchesAllTags(["Função Quadrática"], ["funcao quadratica"])).toBe(true);
  });

  it("questão sem tag não passa por filtro com tag", () => {
    expect(matchesAllTags([], ["álgebra"])).toBe(false);
  });

  it("nome inválido não derruba o filtro", () => {
    expect(matchesAllTags(["  ", "álgebra"], ["álgebra"])).toBe(true);
  });
});

describe("countTags", () => {
  const questions = [
    { tags: ["Álgebra", "Funções"] },
    { tags: ["álgebra"] },
    { tags: ["Geometria"] },
  ];

  it("conta as grafias diferentes como a mesma tag", () => {
    expect(countTags(questions).find((t) => t.name === "Álgebra")?.count).toBe(2);
  });

  it("ordena por contagem, e depois por nome", () => {
    expect(countTags(questions).map((t) => t.name)).toEqual(["Álgebra", "Funções", "Geometria"]);
  });

  it("a mesma tag repetida na mesma questão conta uma vez", () => {
    // O banco impede, mas um import pode produzir.
    expect(countTags([{ tags: ["álgebra", "Álgebra"] }])[0]?.count).toBe(1);
  });

  it("lista vazia não quebra", () => {
    expect(countTags([])).toEqual([]);
  });
});

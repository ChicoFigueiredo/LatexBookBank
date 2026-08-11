import { describe, expect, it } from "vitest";

import {
  activeFilterCount,
  DEFAULT_LIMIT,
  EMPTY_QUERY,
  isEmptyQuery,
  normalizeQuery,
} from "@modules/questions/domain/search-query";

/**
 * A consulta é o contrário do patch do agente: aqui valor inválido é **descartado**, não
 * recusado. Busca é exploratória, e um ano digitado errado no meio de cinco filtros não deve
 * devolver erro — deve devolver o resultado dos quatro que fazem sentido.
 */

describe("normalização", () => {
  it("o vazio é um estado legítimo", () => {
    expect(normalizeQuery({})).toEqual(EMPTY_QUERY);
    expect(isEmptyQuery(EMPTY_QUERY)).toBe(true);
  });

  it("texto é aparado e limitado", () => {
    expect(normalizeQuery({ text: "  juros  " }).text).toBe("juros");
    expect(normalizeQuery({ text: "x".repeat(500) }).text).toHaveLength(200);
  });

  it("valor inválido **some**, e o resto da consulta sobrevive", () => {
    const query = normalizeQuery({
      text: "juros",
      years: [2024, "não é ano", 1500, "2020"],
      types: ["MULTIPLE_CHOICE", "INVENTADO"],
      difficulties: [7, 3],
    });

    expect(query.text).toBe("juros");
    expect(query.years).toEqual([2024, 2020]);
    expect(query.types).toEqual(["MULTIPLE_CHOICE"]);
    // 3 não está na escala legada 0 · 2 · 5 · 7 · 10.
    expect(query.difficulties).toEqual([7]);
  });

  it("tag em branco não vira filtro", () => {
    // Um filtro vazio recusaria tudo em silêncio, e a tela pareceria um acervo vazio.
    expect(normalizeQuery({ tags: ["juros", "   ", ""] }).tags).toEqual(["juros"]);
  });

  it("`limit` é limitado nos dois extremos", () => {
    expect(normalizeQuery({}).limit).toBe(DEFAULT_LIMIT);
    expect(normalizeQuery({ limit: 5000 }).limit).toBe(200);
    expect(normalizeQuery({ limit: 0 }).limit).toBe(1);
    expect(normalizeQuery({ limit: "25" }).limit).toBe(25);
    expect(normalizeQuery({ limit: 10.5 }).limit).toBe(DEFAULT_LIMIT);
  });
});

describe("contagem de filtros", () => {
  it("conta cada valor, não cada categoria", () => {
    // A tela mostra este número no botão. Um filtro esquecido explica um resultado vazio que
    // pareceria acervo vazio.
    const query = normalizeQuery({
      tags: ["juros", "matemática"],
      boards: ["FGV"],
      years: [2024],
    });

    expect(activeFilterCount(query)).toBe(4);
  });

  it("texto não conta como filtro — ele já está à vista no campo", () => {
    expect(activeFilterCount(normalizeQuery({ text: "juros" }))).toBe(0);
  });

  it("consulta só com texto não é vazia", () => {
    expect(isEmptyQuery(normalizeQuery({ text: "juros" }))).toBe(false);
  });
});

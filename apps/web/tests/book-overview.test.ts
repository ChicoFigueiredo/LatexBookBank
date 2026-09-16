import { describe, expect, it } from "vitest";

import {
  type NoDaEstrutura,
  faixaRevisada,
  formatarTamanho,
  resumirCaptura,
  sumarizarCapitulos,
} from "@modules/publications/domain/book-overview";

/**
 * O que esta tela conta é a resposta a "o livro está pronto?", e contar em árvore é onde ela
 * passaria a mentir em silêncio. Cada teste aqui é um jeito de mentir que já foi tentado.
 */

const no = (parcial: Partial<NoDaEstrutura> & { id: string }): NoDaEstrutura => ({
  parentId: null,
  kind: "SECTION",
  title: null,
  originalLabel: null,
  sortKey: parcial.id,
  isQuestion: false,
  isInvalid: false,
  ...parcial,
});

describe("sumarizarCapitulos", () => {
  it("conta a subárvore inteira, e não só os filhos diretos", () => {
    // Livro real: a questão mora em CHAPTER › SECTION › QUESTION_GROUP › QUESTION.
    const nos = [
      no({ id: "c1", kind: "CHAPTER", title: "Conjuntos", originalLabel: "1", sortKey: "a" }),
      no({ id: "s1", parentId: "c1", kind: "SECTION", sortKey: "b" }),
      no({ id: "g1", parentId: "s1", kind: "QUESTION_GROUP", sortKey: "c" }),
      no({ id: "q1", parentId: "g1", kind: "QUESTION", isQuestion: true, sortKey: "d" }),
      no({ id: "q2", parentId: "g1", kind: "QUESTION", isQuestion: true, isInvalid: true, sortKey: "e" }),
    ];

    const [capitulo] = sumarizarCapitulos(nos);

    expect(capitulo?.questionCount).toBe(2);
    expect(capitulo?.invalidCount).toBe(1);
    expect(capitulo?.reviewedCount).toBe(1);
    expect(capitulo?.pct).toBe(50);
  });

  it("não conta a questão de um capítulo no outro", () => {
    const nos = [
      no({ id: "c1", kind: "CHAPTER", sortKey: "a" }),
      no({ id: "c2", kind: "CHAPTER", sortKey: "b" }),
      no({ id: "q1", parentId: "c1", isQuestion: true, sortKey: "c" }),
      no({ id: "q2", parentId: "c2", isQuestion: true, sortKey: "d" }),
      no({ id: "q3", parentId: "c2", isQuestion: true, sortKey: "e" }),
    ];

    expect(sumarizarCapitulos(nos).map((c) => c.questionCount)).toEqual([1, 2]);
  });

  it("capítulo vazio é 0%, e não 100%", () => {
    const [capitulo] = sumarizarCapitulos([no({ id: "c1", kind: "CHAPTER" })]);

    expect(capitulo?.pct).toBe(0);
    expect(capitulo?.questionCount).toBe(0);
  });

  it("ordena pelo sortKey e numera quem não tem rótulo do livro", () => {
    const nos = [
      no({ id: "c2", kind: "CHAPTER", title: "Funções", sortKey: "b" }),
      no({ id: "c1", kind: "CHAPTER", title: "Conjuntos", sortKey: "a", originalLabel: "I" }),
    ];

    expect(sumarizarCapitulos(nos).map((c) => [c.label, c.title])).toEqual([
      ["I", "Conjuntos"],
      ["2", "Funções"],
    ]);
  });

  it("nó órfão não derruba a conta — o acervo importado tem alguns", () => {
    const nos = [
      no({ id: "c1", kind: "CHAPTER", sortKey: "a" }),
      no({ id: "q1", parentId: "c1", isQuestion: true, sortKey: "b" }),
      no({ id: "orfa", parentId: "sumiu", isQuestion: true, sortKey: "c" }),
    ];

    expect(sumarizarCapitulos(nos)[0]?.questionCount).toBe(1);
  });

  it("ciclo na árvore não trava a tela", () => {
    const nos = [
      no({ id: "c1", kind: "CHAPTER", sortKey: "a" }),
      no({ id: "a", parentId: "c1", sortKey: "b" }),
      no({ id: "b", parentId: "a", sortKey: "c" }),
    ];
    // `a` vira filho de `b`, que é filho de `a`. Não deveria existir; travar seria pior.
    const comCiclo = nos.map((n) => (n.id === "a" ? { ...n, parentId: "b" } : n));

    expect(() => sumarizarCapitulos(comCiclo)).not.toThrow();
  });
});

describe("faixaRevisada", () => {
  const cap = (label: string, questionCount: number, invalidCount = 0) => ({
    id: label,
    label,
    title: label,
    questionCount,
    invalidCount,
    reviewedCount: questionCount - invalidCount,
    pct: questionCount === 0 ? 0 : 100,
  });

  it("é a faixa contígua desde o começo, não o total espalhado", () => {
    expect(faixaRevisada([cap("1", 4), cap("2", 3), cap("3", 5, 1), cap("4", 2)])).toBe(
      "capítulos 1–2 revisados",
    );
  });

  it("um só capítulo fala no singular", () => {
    expect(faixaRevisada([cap("1", 4), cap("2", 3, 2)])).toBe("capítulo 1 revisado");
  });

  it("capítulo vazio não conta como revisado — vazio não é pronto", () => {
    expect(faixaRevisada([cap("1", 0), cap("2", 3)])).toBeNull();
  });
});

describe("formatarTamanho", () => {
  it("usa vírgula, porque o número é lido e não calculado", () => {
    expect(formatarTamanho(40_000_000)).toBe("38,1 MB");
  });

  it("abaixo de 1 MB vira KB inteiro", () => {
    expect(formatarTamanho(421_888)).toBe("412 KB");
  });

  it("arquivo minúsculo não vira 0 KB", () => {
    expect(formatarTamanho(12)).toBe("1 KB");
  });
});

describe("resumirCaptura", () => {
  it("some quando não há recorte nenhum — barra vazia não informa", () => {
    expect(resumirCaptura(0, 0, null)).toBeNull();
  });

  it("o denominador é o total de recortes reais, sem estimativa inventada", () => {
    const captura = resumirCaptura(148, 52, 412);

    expect(captura?.label).toBe("148 / 200 recortes");
    expect(captura?.pct).toBe(74);
    expect(captura?.lastPage).toBe(412);
  });
});

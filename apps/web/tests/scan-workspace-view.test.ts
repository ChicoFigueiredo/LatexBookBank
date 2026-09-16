import { describe, expect, it } from "vitest";

import { isToReview } from "@modules/questions/domain/to-review";
import {
  countsByState,
  cycleRegion,
  filterWithAncestors,
  flattenTree,
  overlaysForPage,
  rowLabel,
  type ViewItem,
} from "@modules/scan/domain/workspace-view";

/** A lógica da tela de revisão (D47), fora do React. */

const box = { x: 0.1, y: 0.1, width: 0.5, height: 0.2 };

function item(partial: Partial<ViewItem> & Pick<ViewItem, "id" | "key" | "kind" | "sortOrder">): ViewItem {
  return {
    parentKey: null,
    originalLabel: null,
    number: null,
    title: null,
    text: "",
    confidence: 0.9,
    reviewState: "AUTO_ACCEPTABLE",
    documentNodeId: null,
    regions: [{ pageNumber: 1, box, role: "PRIMARY" }],
    diagnostic: null,
    ...partial,
  };
}

const chapter = item({ id: "c", key: "C", kind: "CHAPTER", sortOrder: 0, originalLabel: "Capítulo 1", title: "Funções" });
const exercise = item({
  id: "e",
  key: "E",
  kind: "EXERCISE",
  sortOrder: 2,
  parentKey: "C",
  originalLabel: "1.",
  text: "1. Calcule o valor de f(2).",
  confidence: 0.5,
  reviewState: "NEEDS_REVIEW",
  regions: [
    { pageNumber: 1, box: { ...box, y: 0.7 }, role: "PRIMARY" },
    { pageNumber: 2, box, role: "CONTINUATION" },
  ],
});
const content = item({ id: "t", key: "T", kind: "CONTENT", sortOrder: 1, parentKey: "C", text: "Uma função é uma regra." });

describe("árvore da proposta", () => {
  it("pré-ordem com profundidade, pai antes dos filhos, na ordem de leitura", () => {
    expect(flattenTree([exercise, content, chapter]).map((row) => [row.item.id, row.depth])).toEqual([
      ["c", 0],
      ["t", 1],
      ["e", 1],
    ]);
  });

  it("o filtro leva os ancestrais junto", () => {
    expect(filterWithAncestors([chapter, content, exercise], "low").map((i) => i.id)).toEqual(["c", "e"]);
    expect(filterWithAncestors([chapter, content, exercise], "structure").map((i) => i.id)).toEqual(["c"]);
  });

  it("o rótulo diz o que está impresso — e o começo do enunciado quando só há um número", () => {
    expect(rowLabel(chapter)).toBe("Capítulo 1 — Funções");
    expect(rowLabel(exercise)).toBe("1. Calcule o valor de f(2).");
    expect(rowLabel(content)).toBe("Uma função é uma regra.");
  });

  it("conta por estado, e o que já está no acervo sai das pendências", () => {
    const counts = countsByState([chapter, exercise, { ...content, documentNodeId: "n" }]);
    expect(counts).toMatchObject({ suggested: 1, needsReview: 1, inCollection: 1, lowConfidence: 1 });
  });
});

describe("marcas no PDF", () => {
  it("só as da página, o escolhido por cima, com a posição entre as âncoras", () => {
    const page1 = overlaysForPage([chapter, exercise], 1, "e");
    expect(page1.map((o) => [o.id, o.tone])).toEqual([
      ["c", "structure"],
      ["e", "selected"],
    ]);
    expect(page1[1]?.label).toBe("Exercício · 1/2");
    expect(overlaysForPage([chapter, exercise], 2, null).map((o) => [o.id, o.regionIndex, o.tone])).toEqual([
      ["e", 1, "question"],
    ]);
  });

  it("navegar entre âncoras dá a volta", () => {
    expect(cycleRegion(3, 2, 1)).toBe(0);
    expect(cycleRegion(3, 0, -1)).toBe(2);
    expect(cycleRegion(0, 0, 1)).toBe(0);
  });
});

describe("a revisar (D40)", () => {
  it("rascunho com âncora de máquina; conferido ou digitado à mão, não", () => {
    expect(isToReview({ status: "DRAFT", anchorMethod: "scan:book-v1@1" })).toBe(true);
    expect(isToReview({ status: "DRAFT", anchorMethod: "recognition:openai-compatible-vision" })).toBe(true);
    expect(isToReview({ status: "READY", anchorMethod: "scan:book-v1@1" })).toBe(false);
    expect(isToReview({ status: "DRAFT", anchorMethod: "manual:editor" })).toBe(false);
    expect(isToReview({ status: "DRAFT", anchorMethod: null })).toBe(false);
  });
});

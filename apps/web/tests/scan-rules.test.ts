import { describe, expect, it } from "vitest";

import type { DocLine, ScanDocument } from "@modules/scan/domain/document";
import { pageOffset } from "@modules/scan/domain/furniture";
import { detectColumns, dividerFromAnchors } from "@modules/scan/domain/layout";
import type { PageModel, TextLine } from "@modules/scan/domain/page";
import { examEnemV1, longestAlternativeRun } from "@modules/scan/domain/profiles/exam-enem-v1";
import { combineConfidence } from "@modules/scan/domain/proposal";
import { composeSpacingAccents, stripAccents } from "@modules/scan/domain/text";
import { readTableOfContents } from "@modules/scan/domain/toc";

/** Uma linha de mentira, em pontos. Só o que as regras leem. */
function line(text: string, x0: number, y0: number, x1 = x0 + text.length * 5, extra: Partial<DocLine> = {}): DocLine {
  return {
    id: `l-${text}-${x0}-${y0}`,
    pageNumber: 1,
    text,
    spans: [],
    x0,
    y0,
    x1,
    y1: y0 + 10,
    size: 10,
    fontName: "Regular",
    bold: false,
    italic: false,
    mathRatio: 0,
    slot: 0,
    order: 0,
    ...extra,
  };
}

describe("alternativas A–E", () => {
  const left = () => 50;

  it("a sequência alinhada vale; letra repetida (cadernos de 2022+) é pulada", () => {
    const lines = ["A um", "A um", "B dois", "B dois", "C três", "D quatro", "E cinco"].map((t, i) =>
      line(t, 50, i * 12),
    );
    expect(longestAlternativeRun(lines, left)).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("letra solta fora da margem não conta, e desalinhada quebra a sequência", () => {
    const lines = [
      line("A um", 50, 0),
      line("B dois", 50, 12),
      line("C três", 80, 24), // recuada além da tolerância da margem
      line("C três", 57, 36), // dentro da margem, desalinhada da sequência
    ];
    expect(longestAlternativeRun(lines, left)).toEqual(["A", "B"]);
  });

  it("“A medida…” no enunciado não abre sequência sozinha", () => {
    expect(longestAlternativeRun([line("A medida do lado é 3.", 50, 0)], left)).toEqual(["A"]);
  });
});

describe("diagnóstico da questão ENEM", () => {
  it("invasão e alternativa faltando viram suspeita, com os motivos escritos", () => {
    const lines = [
      line("QUESTÃO 175", 50, 100),
      line("A um", 50, 112),
      line("B dois", 50, 124),
      line("C três", 50, 136),
      line("D quatro", 50, 148),
      line("QUESTÃO 176", 50, 160),
    ];
    const page = { pageNumber: 1, width: 600, height: 800, lines, graphics: [], scanned: false } satisfies PageModel;
    const doc = {
      pages: [page],
      slots: [
        { index: 0, pageNumber: 1, columnIndex: 0, columnCount: 1, column: { x0: 50, x1: 290 }, top: 50, bottom: 750, pageLeft: 50, pageRight: 550 },
      ],
      lines,
      graphics: [],
    } as unknown as ScanDocument;

    const diagnostic = examEnemV1.validateItem!(
      {
        key: "q",
        parentKey: null,
        kind: "QUESTION",
        originalLabel: "QUESTÃO 175",
        number: "175",
        title: null,
        pageNumber: 1,
        printedPage: null,
        regions: [{ pageNumber: 1, role: "PRIMARY", box: { x: 0.08, y: 0.12, width: 0.4, height: 0.1 } }],
        text: "",
        latex: null,
        needsMath: false,
        confidence: 0.9,
        confidenceParts: {},
        evidence: [],
        metadata: {},
        lines,
      },
      doc,
    );

    expect(diagnostic?.status).toBe("suspicious");
    expect(diagnostic?.reasons).toEqual(["alternativas sem texto: E", "outra questão dentro: 176"]);
    expect(diagnostic?.facts["alternativesMissing"]).toEqual(["E"]);
  });
});

describe("colunas", () => {
  it("recuo de parágrafo não é coluna", () => {
    const lines = Array.from({ length: 20 }, (_, i) =>
      i % 4 === 0 ? line("recuo", 88, i * 12, 520) : line("linha cheia", 71, i * 12, 520),
    );
    expect(detectColumns(lines)).toHaveLength(1);
  });

  it("título centrado atravessando a calha não desfaz as duas colunas", () => {
    const lines: TextLine[] = [line("TÍTULO QUE ATRAVESSA", 150, 0, 440)];
    for (let i = 1; i <= 15; i++) {
      lines.push(line("esquerda", 45, i * 12, 285));
      lines.push(line("direita", 305, i * 12, 550));
    }
    expect(detectColumns(lines).map((c) => Math.round(c.x1))).toEqual([302, 550]);
  });

  it("o divisor da prova vem dos cabeçalhos, com três de cada lado", () => {
    expect(dividerFromAnchors([45, 45.2, 45.4, 302.6, 302.6, 303])).toBe(302.6);
    expect(dividerFromAnchors([45, 45, 45, 302.6])).toBeNull();
  });
});

describe("página impressa", () => {
  it("o deslocamento é a moda, e precisa de duas páginas concordando", () => {
    expect(pageOffset(new Map([[3, "1"], [4, "2"], [5, "3"], [9, "xii"]]))).toBe(2);
    expect(pageOffset(new Map([[3, "1"]]))).toBeNull();
  });
});

describe("sumário", () => {
  it("lê partes, capítulos e seções, com pontilhado ou sem", () => {
    const lines = [
      line("Sumário", 71, 60),
      line("I Fundamentos", 71, 100),
      line("1", 520, 100),
      line("1 Números reais", 71, 120),
      line("1", 520, 120),
      line("1.1 Ordem . . . . . . . . 2", 86, 140),
      line("Capítulo 2 Derivadas ........ 5", 71, 160),
    ];
    const toc = readTableOfContents([{ pageNumber: 2, width: 600, height: 800, lines, graphics: [], scanned: false }]);
    expect(toc.pages.has(2)).toBe(true);
    expect(toc.entries.map((e) => [e.kind, e.number, e.printedPage])).toEqual([
      ["PART", "1", 1],
      ["CHAPTER", "1", 1],
      ["SECTION", "1.1", 2],
      ["CHAPTER", "2", 5],
    ]);
  });
});

describe("acentos do TeX antigo (OT1)", () => {
  it("o acento solto volta para a letra certa, e a cedilha só para o c", () => {
    expect(composeSpacingAccents("Pref´ acio da primeira edi¸c˜ ao")).toBe("Prefácio da primeira edição");
    expect(composeSpacingAccents("CONJUNTOS E FUNC¸ ÕES")).toBe("CONJUNTOS E FUNÇÕES");
    expect(composeSpacingAccents("n´ umeros")).toBe("números");
    expect(stripAccents("Exercı́cios")).toBe("Exercicios");
  });

  it("o sumário aceita pontilhado espaçado", () => {
    const lines = [
      line("Sumário", 71, 60),
      line("1 Números naturais . . . . . . . . . . . . 34", 71, 100),
      line("2 Boa ordenação . . . . . . . . . . 39", 71, 120),
      line("3 Conjuntos finitos . . . . . . . . 42", 71, 140),
      line("4 Conjuntos enumeráveis . . . . . . 48", 71, 160),
    ];
    const toc = readTableOfContents([{ pageNumber: 5, width: 600, height: 800, lines, graphics: [], scanned: false }]);
    expect(toc.entries.map((e) => [e.number, e.title, e.printedPage])).toEqual([
      ["1", "Números naturais", 34],
      ["2", "Boa ordenação", 39],
      ["3", "Conjuntos finitos", 42],
      ["4", "Conjuntos enumeráveis", 48],
    ]);
  });
});

describe("confiança", () => {
  it("é a média das partes presentes, sem inventar as ausentes", () => {
    expect(combineConfidence({ pattern: 0.9, typography: 0.7 })).toBe(0.8);
    expect(combineConfidence({})).toBe(0.5);
  });
});

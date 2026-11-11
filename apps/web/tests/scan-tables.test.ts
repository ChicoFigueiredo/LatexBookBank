import { describe, expect, it } from "vitest";

import { figureLatex } from "@modules/scan/domain/approval-latex";
import type { TextLine, TextSpan } from "@modules/scan/domain/page";
import type { ScanItem } from "@modules/scan/domain/scan-item";
import { tableRows } from "@modules/scan/domain/tables";

/**
 * A tabela desenhada vira `tabular`, e não imagem (D78).
 *
 * O caso é a tabela-verdade da p. 17 do *Fundamentos* vol. 1: o motor de figuras a recortava
 * como imagem, e o modelo de visão, que a transcreve, trocou um V por F na segunda linha.
 */

const span = (text: string, x0: number, y: number): TextSpan => ({
  text,
  x0,
  x1: x0 + text.length * 5,
  y0: y,
  y1: y + 10,
  baseline: y + 8,
  size: 10,
  fontName: "FranklinGothic-Book",
  bold: false,
  italic: false,
  math: false,
});

let next = 0;
const line = (y: number, cells: readonly (readonly [string, number])[]): TextLine => {
  const spans = cells.map(([text, x]) => span(text, x, y));
  return {
    id: `l${next++}`,
    pageNumber: 17,
    text: cells.map(([text]) => text).join(" "),
    spans,
    size: 10,
    fontName: "FranklinGothic-Book",
    bold: false,
    italic: false,
    mathRatio: 0,
    x0: spans[0]!.x0,
    y0: y,
    x1: spans.at(-1)!.x1,
    y1: y + 10,
  };
};

const COLUMNS = [100, 150, 200, 260, 320, 400];
const linha = (y: number, values: string) => line(y, values.split(" ").map((value, i) => [value, COLUMNS[i]!] as const));

/** O que a figura engole: o "p" do cabeçalho e as quatro linhas de V e F. */
const engolidas = [
  line(100, [["p", 100]]),
  linha(120, "V V F F V V"),
  linha(135, "V F F F V V"),
  linha(150, "F V V F V V"),
  linha(165, "F F V F F V"),
];

describe("a grade da camada de texto", () => {
  it("lê linhas e colunas pela posição, e deixa vazio o que ela não tem", () => {
    const rows = tableRows(engolidas);
    expect(rows).toHaveLength(5);
    expect(rows?.[0]).toEqual(["p", "", "", "", "", ""]);
    expect(rows?.[2]).toEqual(["V", "F", "F", "F", "V", "V"]);
  });

  it("rótulos espalhados de um diagrama não são grade", () => {
    expect(tableRows([line(100, [["A", 100]]), line(140, [["B", 300]]), line(190, [["C", 180]])])).toBeNull();
  });
});

const figura = (latex: string | null): ScanItem =>
  ({
    kind: "FIGURE",
    metadata: { tableRows: tableRows(engolidas)!.map((row) => row.join("\t")), figureLatexName: "figura-p17.pdf", widthFraction: 0.8 },
    reviewedLatex: null,
    mathResult: latex === null ? null : { latex },
    title: null,
    reviewedText: null,
  }) as unknown as ScanItem;

/** O que o modelo devolveu de verdade na p. 17: o cabeçalho certo, e um F onde o livro tem V. */
const DO_MODELO = [
  "\\begin{tabular}{|c|c|c|c|c|c|}",
  "\\hline",
  "$p$ & $q$ & $\\neg p$ & $p \\land \\neg p$ & $q \\lor p$ & $(p \\land \\neg p) \\rightarrow (q \\lor p)$ \\\\",
  "\\hline",
  "V & V & F & F & V & V \\\\",
  "\\hline",
  "V & F & F & F & F & V \\\\",
  "\\hline",
  "F & V & V & F & V & V \\\\",
  "\\hline",
  "F & F & V & F & F & V \\\\",
  "\\hline",
  "\\end{tabular}",
].join("\n");

describe("a tabela no LaTeX", () => {
  it("o cabeçalho vem do modelo, e as células, da camada de texto", () => {
    const latex = figureLatex(figura(DO_MODELO));

    expect(latex).toContain("$p$ & $q$ & $\\neg p$");
    // A segunda linha do livro: V F F F V V. O modelo tinha escrito V F F F F V.
    expect(latex).toContain("V & F & F & F & V & V \\\\");
    expect(latex).not.toContain("includegraphics");
  });

  it("sem reconhecimento, ou com outra grade, a tabela continua imagem", () => {
    expect(figureLatex(figura(null))).toContain("\\includegraphics");
    const outraGrade = DO_MODELO.replace("F & F & V & F & F & V \\\\", "");
    expect(figureLatex(figura(outraGrade))).toContain("\\includegraphics");
  });
});

import { describe, expect, it } from "vitest";

import { buildLines, type RawPage, type RawSpan } from "@modules/scan/domain/page";
import { captureProfile } from "@modules/scan/domain/profiles";
import { buildProposal } from "@modules/scan/domain/structure";

/**
 * Os itens do Fundamentos diagramados em duas colunas, lidos na ordem do livro.
 *
 * O volume 1 imprime os itens curtos de um exercício em grade — `a)` e `b)` na mesma linha,
 * `c)` e `d)` na de baixo —, e a proposta os entregava a, c, b, d: a página inteira virava duas
 * colunas, e a coluna da direita só era lida depois da da esquerda.
 */

const profile = captureProfile("book-fme-v1")!;
const BODY = 10;
const LEFT = 43;
const GRID = 300;

const span = (
  text: string,
  x0: number,
  baseline: number,
  extra: Partial<RawSpan> = {},
): RawSpan => ({
  text,
  x0,
  x1: x0 + text.length * BODY * 0.5,
  baseline,
  size: BODY,
  fontName: "Times-Roman",
  endsLine: true,
  ...extra,
});

/** O número do exercício em negrito, o enunciado em seguida. */
const exercise = (number: number, statement: string, baseline: number): RawSpan[] => [
  span(`${number}.`, LEFT, baseline, { fontName: "Times-Bold", endsLine: false }),
  span(statement, LEFT + 20, baseline),
];

/** Uma linha da grade: dois itens na mesma altura, um em cada metade. */
const row = (left: string, right: string, baseline: number): RawSpan[] => [
  span(left, LEFT + 15, baseline),
  span(right, GRID, baseline),
];

function exercisesPage(pageNumber: number): RawPage {
  let y = 80;
  const next = (gap = 14) => (y += gap);
  const spans: RawSpan[] = [
    // O banner do bloco, em corpo de título: é o que abre os exercícios no Fundamentos.
    span("E X E R C Í C I O S", LEFT + 100, next(0), { size: 18, fontName: "Times-Bold" }),
  ];
  let number = 40;
  for (let block = 0; block < 6; block++) {
    spans.push(...exercise(number++, "Calcule:", next(22)));
    spans.push(...row("a) 2 + 3 + 4 + 5 + 6", "b) 4 · 5 + 6 · 7 + 8 · 9 + 10 · 11 + 12", next()));
    spans.push(...row("c) 7 − 1 − 2 − 3 − 4", "d) 9 ÷ 3 + 8 ÷ 4 + 6 ÷ 2 + 10 ÷ 5 + 1", next()));
  }
  return { pageNumber, width: 595, height: 842, spans, graphics: [] };
}

describe("itens em duas colunas no Fundamentos", () => {
  it("saem na ordem do livro, a, b, c, d — e cada um sob o seu exercício", () => {
    const proposal = buildProposal([buildLines(exercisesPage(50))], profile);

    const exercises = proposal.items.filter((item) => item.kind === "EXERCISE");
    expect(exercises.length).toBe(6);
    for (const exercise of exercises) {
      const letters = proposal.items
        .filter((item) => item.kind === "ITEM" && item.parentKey === exercise.key)
        .map((item) => item.number);
      expect(letters, `exercício ${exercise.number}`).toEqual(["a", "b", "c", "d"]);
    }
  });
});

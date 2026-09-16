import { escapeLatexText } from "@modules/recognition/domain/latex-escape";

import type { ScanItem } from "./scan-item";

/**
 * O LaTeX que um item leva para o acervo (ADR 0002).
 *
 * O que vale, em ordem: o LaTeX que a pessoa revisou; o que o reconhecimento matemático devolveu;
 * e, só na falta dos dois, o texto da camada do PDF, escapado. O texto cru passa por um mínimo de
 * limpeza — hifenização de fim de linha, o rótulo que já vai em `originalLabel` —, nunca por
 * reescrita.
 */

const EXERCISE_LABEL = /^\s*(?:(?:exerc[ií]cio|problema|exercise|problem)\s+\d+(?:\.\d+)*\s*[.:)]?|\d{1,3}\s*[.)])\s*/i;
const QUESTION_HEADER = /^\s*QUEST[AÃ]O\s+\d{1,3}\s*$/i;
const ITEM_LABEL = /^\s*\(?([a-z]|[ivx]{1,5})\)\s*/i;
const ALTERNATIVE = /^\s*([A-E])(?:\t|\)|\.|\s|$)\s*(.*)$/;

/** Junta as linhas de um parágrafo, desfazendo a hifenização de fim de linha. */
export function joinLines(lines: readonly string[]): string {
  let text = "";
  for (const line of lines.map((l) => l.trim()).filter((l) => l !== "")) {
    if (text.endsWith("-") && /^\p{Ll}/u.test(line)) text = text.slice(0, -1) + line;
    else text = text === "" ? line : `${text} ${line}`;
  }
  return text;
}

const reviewedOrRecognized = (item: ScanItem): string | null =>
  item.reviewedLatex ?? item.mathResult?.latex ?? null;

const textOf = (item: ScanItem): string => item.reviewedText ?? item.text;

/** Teoria, exemplo e nota: um parágrafo, com o rótulo do exemplo em destaque. */
export function contentLatex(item: ScanItem): string {
  const ready = reviewedOrRecognized(item);
  if (ready !== null) return ready.trim();

  const lines = textOf(item).split("\n");
  if (item.kind === "EXAMPLE" && item.originalLabel) {
    const first = (lines[0] ?? "").replace(/^\s*\S+\s+\d+(?:\.\d+)*\s*[.:)]?\s*/, "");
    return `\\textbf{${escapeLatexText(item.originalLabel)}.} ${escapeLatexText(joinLines([first, ...lines.slice(1)]))}`;
  }
  return escapeLatexText(joinLines(lines));
}

export interface QuestionLatex {
  readonly statementLatex: string;
  readonly options: readonly string[];
  /** O que o scan leu, antes de qualquer revisão — vai para `Question.originalLatex`. */
  readonly originalLatex: string;
}

/**
 * Exercício ou questão: o enunciado, com os itens como `enumerate` de rótulo explícito
 * (`\item[a)]`, que compila sem pacote nenhum), e as alternativas separadas quando o tipo pede.
 */
export function questionLatex(
  item: ScanItem,
  children: readonly ScanItem[],
  wantsOptions: boolean,
): QuestionLatex {
  const originalLatex = item.proposed.latex ?? escapeLatexText(item.proposed.text);
  const ready = reviewedOrRecognized(item);
  if (ready !== null) return { statementLatex: ready.trim(), options: [], originalLatex };

  let lines = textOf(item)
    .split("\n")
    .filter((line) => !QUESTION_HEADER.test(line));
  if (lines[0]) lines[0] = lines[0].replace(EXERCISE_LABEL, "");

  // Os itens estão dentro do texto do exercício (a região dele os contém): o enunciado é o que
  // vem antes do primeiro, e cada item vira um `\item`.
  const items = children.filter((child) => child.kind === "ITEM" && child.reviewState !== "REJECTED");
  const firstItemText = items[0]?.text.split("\n")[0];
  if (firstItemText) {
    const cut = lines.findIndex((line) => line.trim() === firstItemText.trim());
    if (cut >= 0) lines = lines.slice(0, cut);
  }

  let options: string[] = [];
  if (wantsOptions) {
    const start = lines.findIndex((line) => ALTERNATIVE.exec(line)?.[1] === "A");
    if (start >= 0) {
      const parsed: string[][] = [];
      for (const line of lines.slice(start)) {
        const match = ALTERNATIVE.exec(line);
        const expected = String.fromCharCode(65 + parsed.length);
        if (match && match[1] === expected) parsed.push([match[2] ?? ""]);
        else parsed[parsed.length - 1]?.push(line);
      }
      if (parsed.length >= 2) {
        options = parsed.map((option) => escapeLatexText(joinLines(option)));
        lines = lines.slice(0, start);
      }
    }
  }

  let statement = escapeLatexText(joinLines(lines));
  if (items.length > 0) {
    const entries = items.map((child) => {
      const label = child.originalLabel ?? `${child.number ?? ""})`;
      const ready = reviewedOrRecognized(child);
      const body = ready ?? escapeLatexText(joinLines(textOf(child).split("\n")).replace(ITEM_LABEL, ""));
      return `  \\item[${label}] ${body.trim()}`;
    });
    statement = `${statement}\n\\begin{enumerate}\n${entries.join("\n")}\n\\end{enumerate}`;
  }

  return { statementLatex: statement.trim(), options, originalLatex };
}

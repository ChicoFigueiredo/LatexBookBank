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

/** Onde o rótulo do livro acaba e o texto começa: "Exemplo 3.", "Exemplo 2.4:", "Exemplo 7)". */
const LABEL_PREFIX = /^\s*\S+\s+\d+(?:\.\d+)*\s*[.:)]?\s*/;

/** Teoria e nota: um parágrafo. */
export function contentLatex(item: ScanItem): string {
  const ready = reviewedOrRecognized(item);
  if (ready !== null) return ready.trim();
  return escapeLatexText(joinLines(textOf(item).split("\n")));
}

/**
 * O corpo do exemplo (D56): o texto **sem** o rótulo.
 *
 * Antes o rótulo entrava em negrito no meio do corpo da seção, porque era a única marca de que
 * ali começava um exemplo. Agora o rótulo é do nó, e repeti-lo no corpo diria a mesma coisa duas
 * vezes — na árvore e na primeira linha do texto.
 */
export function exampleBody(item: ScanItem): string {
  const ready = reviewedOrRecognized(item);
  if (ready !== null) return ready.trim();

  const lines = textOf(item).split("\n");
  const first = stripLabel(lines[0] ?? "", item);
  return escapeLatexText(joinLines([first, ...lines.slice(1)]));
}

/**
 * Tira o rótulo do começo do texto — e **só** quando o rótulo existe.
 *
 * O padrão `palavra número` casa texto comum: "Sejam 2 e 3 os valores…" perderia as duas
 * primeiras palavras, no corpo e no título, sem ninguém notar. Quem autoriza o corte é o rótulo
 * que o perfil leu ("Exemplo 3"), não o formato da frase.
 */
function stripLabel(text: string, item: ScanItem): string {
  if (item.originalLabel === null) return text;
  const stripped = text.replace(LABEL_PREFIX, "");
  return stripped === text || stripped.trim() === "" ? text : stripped;
}

/**
 * A figura no LaTeX (D58, ADR 0005): `figure` com `[H]`, na posição em que o livro a tem.
 *
 * `[H]` e não `[htbp]` porque a figura do livro **pertence ao parágrafo** que a explica; deixá-la
 * flutuar para o alto da página desfaria justamente o que a importação preserva. A largura é a
 * fração que a figura ocupa na coluna do livro, medida na varredura.
 *
 * Sem arquivo — o recorte falhou, ou a varredura correu sem recortar — sai um aviso em vez de um
 * `\includegraphics` quebrado: um LaTeX que não compila é pior que uma figura que falta.
 */
export function figureLatex(item: ScanItem): string {
  const name = item.metadata["figureLatexName"];
  const caption = (item.reviewedText ?? item.title ?? "").trim();
  const captionLine = caption === "" ? "" : `  \\caption{${escapeLatexText(caption)}}\n`;

  if (typeof name !== "string" || name === "") {
    return `% figura da página ${item.pageNumber} sem arquivo — recorte não gravado${caption === "" ? "" : `: ${caption}`}`;
  }

  const fraction = Number(item.metadata["widthFraction"]);
  const width = Number.isFinite(fraction) && fraction > 0 ? Math.min(1, Math.max(0.15, fraction)) : 0.6;

  return [
    "\\begin{figure}[H]",
    "  \\centering",
    `  \\includegraphics[width=${width.toFixed(2)}\\textwidth]{${name}}`,
    captionLine.trimEnd(),
    "\\end{figure}",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** Quanto do exemplo cabe numa linha da árvore sem empurrar o resto para fora. */
const TITLE_LENGTH = 60;

/**
 * O título do exemplo: o começo do próprio texto, sem o rótulo.
 *
 * "Exemplo 3" sozinho não diz qual dos 107 é. O começo do enunciado diz, e é o mesmo critério
 * que a árvore já usa para uma questão sem apelido.
 */
export function exampleTitle(item: ScanItem): string | null {
  const plain = stripLabel(textOf(item).replace(/\s+/g, " "), item).trim();
  if (plain === "") return null;
  return plain.length > TITLE_LENGTH ? `${plain.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : plain;
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

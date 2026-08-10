import { DEFAULT_RENDER_OPTIONS, type RenderBundle } from "@latexbookbank/render-contract";

import type { RenderProfile } from "@latexbookbank/render-contract";

/**
 * Monta o `RenderBundle` de uma questão.
 *
 * É o `LatexBuilder` do planejamento, e é o único lugar que sabe **como uma questão vira um
 * documento**. Módulos editoriais chamam isto; nenhum deles escreve LaTeX de estrutura.
 *
 * A montagem é deliberadamente literal: enunciado, alternativas, resposta. Nada de numeração
 * automática, cabeçalho ou rodapé — isso é da prova montada (Fase 16), e antecipá-lo aqui faria
 * cada preview de questão carregar decoração que ninguém pediu.
 */

export interface QuestionForRender {
  readonly id: string;
  readonly statementLatex: string;
  readonly solutionLatex: string;
  readonly complementLatex: string;
  readonly options: readonly { readonly statementLatex: string; readonly isCorrect: boolean }[];
}

export interface BuildBundleInput {
  readonly jobId: string;
  readonly question: QuestionForRender;
  readonly profile: RenderProfile;
  /** Assets já resolvidos: nome usado no LaTeX → metadados. */
  readonly assets?: RenderBundle["assets"];
  readonly options?: Partial<RenderBundle["options"]>;
  /** Quando falso, sai só o enunciado e as alternativas — é o que se mostra ao aluno. */
  readonly includeSolution?: boolean;
}

/**
 * De onde veio cada linha do corpo.
 *
 * `options` não é um campo de texto do editor — é a aba Alternativas —, e por isso o `line` dela
 * significa outra coisa: o **número da alternativa**, não uma linha de LaTeX. Quem consome precisa
 * saber disso, e é mais honesto dizer aqui do que devolver um número de linha que não existe.
 */
export type RenderSourceField = "statementLatex" | "solutionLatex" | "complementLatex" | "options";

export interface RenderSourceSpan {
  readonly field: RenderSourceField;
  /** Primeira linha do corpo ocupada por este bloco, contando de 1. */
  readonly startLine: number;
  readonly lineCount: number;
  /**
   * Onde começa o texto **da pessoa** dentro do bloco.
   *
   * Difere de `startLine` quando o bloco leva estrutura na frente: a resposta entra depois de uma
   * linha em branco, de um `\medskip` e do rótulo `\textbf{Resposta.}` — três linhas que ninguém
   * escreveu e para as quais não faz sentido levar o cursor.
   */
  readonly textStartLine: number;
}

/**
 * As alternativas, como lista LaTeX.
 *
 * `enumerate` com `label=\alph*)` e não letras escritas à mão: a letra é **projeção da ordem**
 * (D9), e escrevê-la no texto reintroduziria o erro do legado — reordenar alternativas deixava o
 * gabarito apontando para a letra errada.
 */
function optionsBlock(options: QuestionForRender["options"]): string[] {
  if (options.length === 0) return [];

  return [
    "\\begin{enumerate}[label=\\alph*), itemsep=2pt, topsep=4pt]",
    ...options.map((option) => `  \\item ${option.statementLatex}`),
    "\\end{enumerate}",
  ];
}

interface Block {
  readonly field: RenderSourceField;
  readonly lines: readonly string[];
  /** Quantas linhas do bloco são estrutura antes do texto da pessoa. */
  readonly prefixLines: number;
}

/**
 * O corpo e o mapa, na **mesma** passagem.
 *
 * Duas funções montando o mesmo documento divergiriam — e divergiriam em silêncio, porque o
 * sintoma seria um cursor uma linha fora do lugar, que qualquer um atribui ao editor antes de
 * desconfiar do mapa.
 */
function composeBody(input: BuildBundleInput): {
  readonly sourceLatex: string;
  readonly spans: readonly RenderSourceSpan[];
} {
  const { question } = input;
  const withSolution = input.includeSolution === true;

  const blocks: Block[] = [
    { field: "statementLatex", lines: question.statementLatex.split("\n"), prefixLines: 0 },
  ];

  const options = optionsBlock(question.options);
  if (options.length > 0) {
    // O `\begin{enumerate}` é a única linha de estrutura antes da primeira alternativa.
    blocks.push({ field: "options", lines: options, prefixLines: 1 });
  }

  if (withSolution && question.solutionLatex.trim() !== "") {
    blocks.push({
      field: "solutionLatex",
      lines: ["", "\\medskip", "\\textbf{Resposta.} " + question.solutionLatex],
      prefixLines: 2,
    });
  }

  if (withSolution && question.complementLatex.trim() !== "") {
    blocks.push({
      field: "complementLatex",
      lines: ["", "\\medskip", "\\textbf{Complemento.} " + question.complementLatex],
      prefixLines: 2,
    });
  }

  const joined = blocks.flatMap((block) => block.lines).join("\n");

  /**
   * `trim` no fim: linha em branco final vira parágrafo vazio no LaTeX, e num `standalone` com
   * `preview` isso aparece como espaço extra embaixo do recorte.
   *
   * O que ele tira **no começo** desloca todas as linhas, e é por isso que o mapa é calculado
   * depois: um enunciado que comece com uma linha em branco jogaria o mapa inteiro uma linha
   * adiante, e o editor apontaria consistentemente para a linha de baixo.
   */
  const sourceLatex = joined.trim();
  const dropped = joined.length - joined.trimStart().length;
  const droppedLines = joined.slice(0, dropped).split("\n").length - 1;

  const spans: RenderSourceSpan[] = [];
  let cursor = 1 - droppedLines;

  for (const block of blocks) {
    spans.push({
      field: block.field,
      startLine: cursor,
      lineCount: block.lines.length,
      textStartLine: cursor + block.prefixLines,
    });
    cursor += block.lines.length;
  }

  return { sourceLatex, spans };
}

export function buildRenderBundle(input: BuildBundleInput): RenderBundle {
  return {
    jobId: input.jobId,
    sourceLatex: composeBody(input).sourceLatex,
    profile: input.profile,
    assets: input.assets ?? [],
    options: { ...DEFAULT_RENDER_OPTIONS, ...input.options },
  };
}

/** O mapa do corpo compilado de volta para os campos do editor. */
export const buildSourceMap = (input: BuildBundleInput): readonly RenderSourceSpan[] =>
  composeBody(input).spans;

/**
 * Onde, no editor, fica a linha `line` do corpo compilado.
 *
 * Devolve `null` quando a linha não pertence a nenhum bloco — acontece com o que o `trim` cortou e
 * com número fora do corpo, e nesses casos não apontar é a resposta certa: mandar o cursor para
 * "mais ou menos ali" é pior que dizer que não se sabe.
 */
export function locateBodyLine(
  spans: readonly RenderSourceSpan[],
  line: number,
): { readonly field: RenderSourceField; readonly line: number } | null {
  const span = spans.find(
    (entry) => line >= entry.startLine && line < entry.startLine + entry.lineCount,
  );
  if (span === undefined) return null;

  // Linha de estrutura (o `\medskip`, o `\begin{enumerate}`) cai no começo do texto: é o lugar mais
  // próximo que a pessoa pode de fato editar.
  return { field: span.field, line: Math.max(1, line - span.textStartLine + 1) };
}

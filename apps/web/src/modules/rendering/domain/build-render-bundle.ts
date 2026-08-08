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

export function buildRenderBundle(input: BuildBundleInput): RenderBundle {
  const { question } = input;

  const body = [
    question.statementLatex,
    ...optionsBlock(question.options),
    ...(input.includeSolution === true && question.solutionLatex.trim() !== ""
      ? ["", "\\medskip", "\\textbf{Resposta.} " + question.solutionLatex]
      : []),
    ...(input.includeSolution === true && question.complementLatex.trim() !== ""
      ? ["", "\\medskip", "\\textbf{Complemento.} " + question.complementLatex]
      : []),
  ];

  return {
    jobId: input.jobId,
    // `trim` no fim: linha em branco final vira parágrafo vazio no LaTeX, e num `standalone` com
    // `preview` isso aparece como espaço extra embaixo do recorte.
    sourceLatex: body.join("\n").trim(),
    profile: input.profile,
    assets: input.assets ?? [],
    options: { ...DEFAULT_RENDER_OPTIONS, ...input.options },
  };
}

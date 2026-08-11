import { DEFAULT_RENDER_OPTIONS, type RenderBundle } from "@latexbookbank/render-contract";

import {
  block,
  composeLatex,
  type QuestionLatexBlock,
  type QuestionLatexSpan,
} from "@modules/questions/domain/question-latex";
import type { QuestionForPlugin } from "@modules/questions/domain/question-type-plugin";
import { pluginFor } from "@modules/questions/domain/question-type-plugin";
import { isQuestionType } from "@modules/questions/domain/question-type";

import type { RenderProfile } from "@latexbookbank/render-contract";

/**
 * Monta o `RenderBundle` de uma questão.
 *
 * É o `LatexBuilder` do planejamento, e desde a #165 ele **não sabe mais escrever LaTeX**: quem
 * monta o corpo é o plugin do tipo. Antes a montagem era literal aqui, e o efeito é que acrescentar
 * um tipo de questão dava validação própria, preview próprio — e um PDF igual ao da múltipla
 * escolha. A §42 diz que todo tipo novo entra pelo registry; para compilar, isso não valia.
 *
 * O caminho literal continua existindo como **fallback**, e não por simetria: a Fase 11 vai
 * importar tipos que ainda não têm plugin, e recusar compilá-los seria entregar menos do que já se
 * entrega hoje. Ele mora em `fallbackBlocks`, com o nome dizendo o que é.
 *
 * Nada de numeração automática, cabeçalho ou rodapé — isso é da prova montada (Fase 16), e
 * antecipá-lo aqui faria cada preview de questão carregar decoração que ninguém pediu.
 */

/**
 * Import de efeito colateral, e é ele que **faz o registry existir** no caminho de compilação.
 *
 * A mesma lição da #147, agora do outro lado: lá, `pluginFor` devolvia `null` para tudo em
 * produção porque ninguém importava o registro, e as questões ficaram `UNVALIDATED` por seis
 * fases, em silêncio. Aqui o silêncio seria pior ainda — o fallback compila, o PDF sai, e ninguém
 * descobre que o plugin do tipo nunca foi consultado.
 */
import "@modules/questions/domain/plugins";

export interface QuestionForRender extends Omit<QuestionForPlugin, "type"> {
  readonly id: string;
  /**
   * Texto, e não `QuestionType`.
   *
   * O acervo legado tem tipos que o produto ainda não sabe tratar, e o import da Fase 11 vai
   * trazê-los. Tipar como o vocabulário fechado obrigaria a escolher um tipo por omissão na hora
   * de ler o banco — quer dizer, decidir em nome de quem importou o que a questão é.
   */
  readonly type: string;
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

/** Onde, nos campos do editor, cada linha do corpo nasceu. */
export type RenderSourceSpan = QuestionLatexSpan;
export type RenderSourceField = QuestionLatexSpan["origin"];

/**
 * A montagem de quando não há plugin.
 *
 * Deliberadamente literal, e deliberadamente igual ao que existia antes da #165: o acervo legado
 * tem tipos que ainda não têm plugin, e para eles o produto precisa continuar compilando algo
 * razoável. "Razoável" aqui é enunciado, alternativas e — quando pedido — resposta e complemento.
 */
function fallbackBlocks(input: BuildBundleInput): QuestionLatexBlock[] {
  const { question } = input;
  const withSolution = input.includeSolution === true;

  const blocks: QuestionLatexBlock[] = [block("statementLatex", question.statementLatex)];

  if (question.options.length > 0) {
    blocks.push({
      origin: "options",
      lines: [
        "\\begin{enumerate}[label=\\alph*), itemsep=2pt, topsep=4pt]",
        ...question.options.map((option) => `  \\item ${option.statementLatex}`),
        "\\end{enumerate}",
      ],
      prefixLines: 1,
    });
  }

  if (withSolution && question.solutionLatex.trim() !== "") {
    blocks.push({
      origin: "solutionLatex",
      lines: ["", "\\medskip", "\\textbf{Resposta.} " + question.solutionLatex],
      prefixLines: 2,
    });
  }

  if (withSolution && question.complementLatex.trim() !== "") {
    blocks.push({
      origin: "complementLatex",
      lines: ["", "\\medskip", "\\textbf{Complemento.} " + question.complementLatex],
      prefixLines: 2,
    });
  }

  return blocks;
}

/** Os blocos do tipo, ou os do fallback quando o tipo ainda não tem plugin. */
function blocksFor(input: BuildBundleInput): readonly QuestionLatexBlock[] {
  const { question } = input;
  const { type } = question;

  // Tipo fora do vocabulário não é erro aqui: o import do legado pode trazer um, e o produto
  // precisa compilar a questão em vez de recusá-la (mesma regra da validação, que o chama de
  // `UNVALIDATED` em vez de `INVALID`).
  if (!isQuestionType(type)) return fallbackBlocks(input);

  const plugin = pluginFor(type);
  if (plugin === null) return fallbackBlocks(input);

  return plugin.buildLatexBlocks(
    { ...question, type },
    { ...(input.includeSolution === true ? { includeSolution: true } : {}) },
  );
}

export function buildRenderBundle(input: BuildBundleInput): RenderBundle {
  return {
    jobId: input.jobId,
    sourceLatex: composeLatex(blocksFor(input)).latex,
    profile: input.profile,
    assets: input.assets ?? [],
    options: { ...DEFAULT_RENDER_OPTIONS, ...input.options },
  };
}

/**
 * O mapa do corpo compilado de volta para os campos do editor.
 *
 * Sai da **mesma** montagem do corpo — `blocksFor` é chamado pelos dois —, então não há como o
 * texto dizer uma coisa e o mapa dizer outra. O sintoma de divergirem seria um cursor uma linha
 * fora do lugar, que qualquer um atribui ao editor antes de desconfiar do mapa.
 */
export const buildSourceMap = (input: BuildBundleInput): readonly RenderSourceSpan[] =>
  composeLatex(blocksFor(input)).spans;

export { locateLatexLine as locateBodyLine } from "@modules/questions/domain/question-latex";

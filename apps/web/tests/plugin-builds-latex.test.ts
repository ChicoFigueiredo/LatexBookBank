import { afterEach, describe, expect, it } from "vitest";

import { latexFromBlocks } from "@modules/questions/domain/question-latex";
import {
  pluginFor,
  registerQuestionType,
  type QuestionTypePlugin,
} from "@modules/questions/domain/question-type-plugin";
// **Nenhum import de `domain/plugins` aqui.** É o ponto do arquivo: quem carrega o registro é o
// caminho de compilação, e é isso que este teste verifica.
import {
  buildRenderBundle,
  buildSourceMap,
  type QuestionForRender,
} from "@modules/rendering/domain/build-render-bundle";
import { QUESTION_PREVIEW_PROFILE } from "@modules/rendering/domain/latex-profile";

/**
 * **Um tipo novo muda o PDF.**
 *
 * A §42 diz que todo tipo de questão entra pelo registry. Isso valia para validação e para o
 * preview, e **não valia para compilar**: o builder montava o documento de forma literal, e o
 * `buildLatex` do plugin — escrito na Fase 7 — nunca teve chamador. O efeito era silencioso do
 * pior jeito: acrescentar um tipo dava validação própria, preview próprio, e um PDF idêntico ao
 * da múltipla escolha. Nada quebrava; só saía errado.
 *
 * Este arquivo registra um tipo de mentira com um corpo inconfundível e afirma que ele **chega ao
 * bundle**. É o quinto caso do mesmo padrão neste projeto (#139, #141, #143, #147), e a diferença
 * é que desta vez sobra um guarda.
 *
 * Ver issue #165 · spec §42 · §9.
 */

const FAKE_TYPE = "TRUE_FALSE" as const;

const question = (over: Partial<QuestionForRender> = {}): QuestionForRender => ({
  id: "q1",
  type: FAKE_TYPE,
  statementLatex: "O céu é azul?",
  solutionLatex: "Sim.",
  complementLatex: "",
  options: [
    { id: "o1", statementLatex: "Verdadeiro", isCorrect: true },
    { id: "o2", statementLatex: "Falso", isCorrect: false },
  ],
  ...over,
});

/** Um tipo cujo corpo não se confunde com o de nenhum outro. */
const plugin: QuestionTypePlugin = {
  type: FAKE_TYPE,
  label: "Verdadeiro ou falso (teste)",
  validate: () => [],
  buildLatexBlocks: (q) => [
    { origin: "statementLatex", lines: [`\\marcaDoTipo{${q.statementLatex}}`], prefixLines: 0 },
    {
      origin: "options",
      lines: [
        "\\begin{vftabela}",
        ...q.options.map((o) => `  \\vf{${o.statementLatex}}`),
        "\\end{vftabela}",
      ],
      prefixLines: 1,
    },
  ],
  buildFastPreview: () => [],
};

const bundleFor = (over: Partial<QuestionForRender> = {}) =>
  buildRenderBundle({
    jobId: "j1",
    question: question(over),
    profile: QUESTION_PREVIEW_PROFILE,
  });

describe("o plugin do tipo é quem monta o documento", () => {
  afterEach(() => {
    // O registry é global por construção (é o ponto dele). Devolver o plugin de verdade evita que
    // este arquivo mude o resultado dos outros conforme a ordem em que o Vitest os roda.
    const real = pluginFor(FAKE_TYPE);
    if (real === plugin) registerQuestionType({ ...plugin, buildLatexBlocks: () => [] });
  });

  it("um tipo com corpo próprio **muda o LaTeX enviado ao worker**", () => {
    registerQuestionType(plugin);

    const latex = bundleFor().sourceLatex;

    expect(latex).toContain("\\marcaDoTipo{O céu é azul?}");
    expect(latex).toContain("\\begin{vftabela}");
    // E **não** cai no `enumerate` da múltipla escolha, que era o que saía antes da #165 para
    // qualquer tipo do mundo.
    expect(latex).not.toContain("label=\\alph*)");
  });

  it("o mapa de linhas acompanha o corpo do plugin, e não uma montagem paralela", () => {
    // Sem isto, o clique no diagnóstico (#161) voltaria a apontar para a linha errada assim que
    // um tipo montasse o documento de outro jeito — que é exatamente o que esta issue permite.
    registerQuestionType(plugin);

    const spans = buildSourceMap({
      jobId: "j1",
      question: question(),
      profile: QUESTION_PREVIEW_PROFILE,
    });

    expect(spans.map((span) => span.origin)).toEqual(["statementLatex", "options"]);
    // O enunciado é uma linha; a tabela começa na 2, e a primeira alternativa na 3.
    expect(spans[1]?.startLine).toBe(2);
    expect(spans[1]?.textStartLine).toBe(3);
  });

  it("o texto e o mapa saem da **mesma** montagem", () => {
    registerQuestionType(plugin);

    const request = {
      jobId: "j1",
      question: question(),
      profile: QUESTION_PREVIEW_PROFILE,
    };
    const linhas = buildRenderBundle(request).sourceLatex.split("\n").length;
    const spans = buildSourceMap(request);
    const ultimo = spans[spans.length - 1];

    expect((ultimo?.startLine ?? 0) + (ultimo?.lineCount ?? 0) - 1).toBe(linhas);
  });

  it("`latexFromBlocks` é a única junção — o plugin não escreve o texto duas vezes", () => {
    registerQuestionType(plugin);

    // O `type` volta como literal aqui porque `QuestionForRender` o carrega como texto — ele pode
    // vir do legado sem estar no vocabulário, e é o builder que decide o que fazer nesse caso.
    const paraOPlugin = { ...question(), type: FAKE_TYPE };

    expect(latexFromBlocks(plugin.buildLatexBlocks(paraOPlugin))).toBe(bundleFor().sourceLatex);
  });
});

describe("o registro é carregado pelo caminho de compilação", () => {
  it("múltipla escolha compila com o corpo do plugin, sem ninguém importar o registro aqui", () => {
    // É a lição da #147 aplicada do outro lado: lá o registro não era importado em produção e
    // `pluginFor` devolvia `null` para tudo, em silêncio, por seis fases. Aqui o silêncio seria
    // pior — o fallback compila, o PDF sai, e ninguém descobre que o plugin não foi consultado.
    const latex = buildRenderBundle({
      jobId: "j1",
      question: question({ type: "MULTIPLE_CHOICE" }),
      profile: QUESTION_PREVIEW_PROFILE,
    }).sourceLatex;

    expect(latex).toContain("label=\\alph*)");
  });
});

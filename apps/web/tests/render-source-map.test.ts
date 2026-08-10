import { describe, expect, it } from "vitest";

import {
  buildRenderBundle,
  buildSourceMap,
  locateBodyLine,
  type BuildBundleInput,
} from "@modules/rendering/domain/build-render-bundle";
import { QUESTION_PREVIEW_PROFILE } from "@modules/rendering/domain/latex-profile";

/**
 * **De qual campo é esta linha?**
 *
 * O worker devolve o erro na linha do corpo compilado, e o corpo é a montagem de quatro coisas que
 * a pessoa edita em abas separadas. Sem esta tradução, "erro na linha 7" viraria um cursor
 * apontando para a linha 7 do enunciado — que pode ser uma linha em branco, ou não existir.
 *
 * É o tipo de erro que passa despercebido justamente por ser plausível: o cursor vai para algum
 * lugar, e quem lê conclui que o TeX está confuso.
 *
 * Ver issue #161 · spec §12.
 */

const question = (over: Partial<BuildBundleInput["question"]> = {}) => ({
  id: "q1",
  statementLatex: "Primeira linha.\nSegunda linha.\nTerceira linha.",
  solutionLatex: "A resposta.",
  complementLatex: "O complemento.",
  options: [
    { statementLatex: "alternativa a", isCorrect: false },
    { statementLatex: "alternativa b", isCorrect: true },
  ],
  ...over,
});

const input = (over: Partial<BuildBundleInput> = {}): BuildBundleInput => ({
  jobId: "job-1",
  question: question(),
  profile: QUESTION_PREVIEW_PROFILE,
  ...over,
});

describe("o mapa e o corpo saem da mesma montagem", () => {
  it("os spans cobrem exatamente as linhas do corpo, sem buraco e sem sobra", () => {
    // É a afirmação que sustenta todas as outras: se o mapa e o corpo pudessem divergir, cada
    // teste abaixo estaria verificando o mapa contra ele mesmo.
    const request = input({ includeSolution: true });
    const linhas = buildRenderBundle(request).sourceLatex.split("\n").length;
    const spans = buildSourceMap(request);

    expect(spans[0]?.startLine).toBe(1);

    for (let i = 1; i < spans.length; i += 1) {
      const anterior = spans[i - 1];
      expect(spans[i]?.startLine).toBe((anterior?.startLine ?? 0) + (anterior?.lineCount ?? 0));
    }

    const ultimo = spans[spans.length - 1];
    expect((ultimo?.startLine ?? 0) + (ultimo?.lineCount ?? 0) - 1).toBe(linhas);
  });

  it("toda linha do corpo tem um campo — nenhuma cai no vazio", () => {
    const request = input({ includeSolution: true });
    const linhas = buildRenderBundle(request).sourceLatex.split("\n").length;
    const spans = buildSourceMap(request);

    for (let line = 1; line <= linhas; line += 1) {
      expect(locateBodyLine(spans, line), `linha ${line} sem campo`).not.toBeNull();
    }
  });
});

describe("cada linha volta para o campo certo", () => {
  const spans = buildSourceMap(input({ includeSolution: true }));

  it("a linha 2 é a segunda linha do enunciado", () => {
    expect(locateBodyLine(spans, 2)).toEqual({ field: "statementLatex", line: 2 });
  });

  it("a primeira alternativa vem depois do enunciado inteiro, não na linha 1", () => {
    // O enunciado tem três linhas e o `\begin{enumerate}` ocupa a quarta: a alternativa `a` é a 5.
    expect(locateBodyLine(spans, 5)).toEqual({ field: "options", line: 1 });
    expect(locateBodyLine(spans, 6)).toEqual({ field: "options", line: 2 });
  });

  it("a resposta cai em `solutionLatex`, e na **primeira** linha dela", () => {
    // O bloco leva uma linha em branco e um `\medskip` na frente; o texto começa junto do rótulo.
    const total = buildRenderBundle(input({ includeSolution: true })).sourceLatex.split("\n");
    const linhaDaResposta = total.findIndex((line) => line.includes("Resposta.")) + 1;

    expect(locateBodyLine(spans, linhaDaResposta)).toEqual({ field: "solutionLatex", line: 1 });
  });

  it("linha de estrutura cai no começo do texto, nunca em zero ou negativo", () => {
    // O `\medskip` da resposta não é de ninguém; mandar o cursor para a linha 0 seria pior que
    // mandá-lo para o começo do campo.
    const total = buildRenderBundle(input({ includeSolution: true })).sourceLatex.split("\n");
    const medskip = total.findIndex((line) => line === "\\medskip") + 1;

    expect(locateBodyLine(spans, medskip)).toEqual({ field: "solutionLatex", line: 1 });
  });

  it("linha fora do corpo devolve `null` em vez de chutar", () => {
    expect(locateBodyLine(spans, 999)).toBeNull();
    expect(locateBodyLine(spans, 0)).toBeNull();
  });
});

describe("o que muda a montagem muda o mapa junto", () => {
  it("sem `includeSolution` não há span de resposta — nem de complemento", () => {
    const campos = buildSourceMap(input()).map((span) => span.field);

    expect(campos).toEqual(["statementLatex", "options"]);
  });

  it("sem alternativas, a resposta sobe as linhas que a lista ocupava", () => {
    const semOpcoes = buildSourceMap(
      input({ question: question({ options: [] }), includeSolution: true }),
    );

    expect(semOpcoes.map((span) => span.field)).toEqual([
      "statementLatex",
      "solutionLatex",
      "complementLatex",
    ]);
    // O enunciado tem três linhas; o bloco da resposta começa na quarta.
    expect(semOpcoes[1]?.startLine).toBe(4);
  });

  it("o `trim` do corpo é descontado: a linha 1 compilada é a **linha 3 do campo**", () => {
    // O corpo perde as linhas em branco do começo; o campo **não** — elas continuam lá, e é nele
    // que o cursor vai parar. Um mapa que ignorasse o `trim` mandaria o cursor duas linhas acima
    // do erro, do começo ao fim, que é o defeito mais silencioso possível: erra por pouco e sempre.
    const request = input({
      question: question({ statementLatex: "\n\nPrimeira linha de verdade." }),
    });
    const corpo = buildRenderBundle(request).sourceLatex;
    const spans = buildSourceMap(request);

    expect(corpo.startsWith("Primeira linha")).toBe(true);
    expect(locateBodyLine(spans, 1)).toEqual({ field: "statementLatex", line: 3 });
    // E a lista de alternativas continua caindo onde ela de fato está.
    expect(locateBodyLine(spans, 2)?.field).toBe("options");
  });
});

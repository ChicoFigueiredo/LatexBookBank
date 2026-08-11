/**
 * Como uma questão vira um corpo LaTeX — e de onde cada linha dele veio.
 *
 * O plugin de tipo monta **blocos**, não texto. Parece um rodeio, e não é: desde a #161 o
 * diagnóstico do compilador é clicável, e clicar leva o cursor ao campo certo do editor. Isso só
 * funciona porque existe um mapa de "linha do corpo → campo da questão". Se o plugin devolvesse
 * uma string, o mapa teria de ser adivinhado por fora — e adivinhar posição de linha em texto
 * montado por outro é exatamente o tipo de acerto que funciona até o dia em que não funciona, sem
 * avisar.
 *
 * Com blocos, quem monta é quem declara a origem. O texto e o mapa saem da **mesma** passagem, e
 * não há como um dizer uma coisa e o outro dizer outra.
 *
 * Mora em `questions/domain` e não em `rendering/` porque o vocabulário é de questão — enunciado,
 * resposta, complemento, alternativas. Fosse do outro lado, o plugin importaria render e o render
 * importaria o plugin, que é um ciclo.
 *
 * Ver issue #165 · #161 · spec §9.
 */

/**
 * De onde a linha veio.
 *
 * `options` não é um campo de texto do editor — é a aba Alternativas —, e o número que a acompanha
 * significa outra coisa: a **alternativa**, não a linha. Dizer isso aqui é mais honesto que
 * devolver um número de linha que não existe.
 */
export type QuestionLatexOrigin =
  "statementLatex" | "solutionLatex" | "complementLatex" | "options";

export interface QuestionLatexBlock {
  readonly origin: QuestionLatexOrigin;
  readonly lines: readonly string[];
  /**
   * Quantas linhas do bloco são estrutura antes do texto da pessoa.
   *
   * A resposta entra depois de uma linha em branco, de um `\medskip` e de um rótulo — três linhas
   * que ninguém escreveu, e para as quais não faz sentido levar o cursor.
   */
  readonly prefixLines: number;
}

export interface QuestionLatexSpan {
  readonly origin: QuestionLatexOrigin;
  /** Primeira linha do corpo ocupada por este bloco, contando de 1. */
  readonly startLine: number;
  readonly lineCount: number;
  /** Onde começa o texto da pessoa dentro do bloco. */
  readonly textStartLine: number;
}

export interface ComposedLatex {
  readonly latex: string;
  readonly spans: readonly QuestionLatexSpan[];
}

/** Bloco de conveniência: uma origem, um texto, sem estrutura na frente. */
export const block = (
  origin: QuestionLatexOrigin,
  text: string,
  prefixLines = 0,
): QuestionLatexBlock => ({ origin, lines: text.split("\n"), prefixLines });

/**
 * Junta os blocos num corpo, e devolve o mapa junto.
 *
 * O `trim` no fim existe porque linha em branco final vira parágrafo vazio no LaTeX, e num
 * `standalone` com `preview` isso aparece como espaço extra embaixo do recorte. O que ele tira **no
 * começo** desloca todas as linhas — e é por isso que o mapa é calculado depois dele: um enunciado
 * que comece com linha em branco jogaria o mapa inteiro uma linha adiante, do começo ao fim. Errar
 * por pouco e sempre é o pior defeito possível aqui, porque ninguém desconfia do mapa: culpa-se o
 * editor.
 */
export function composeLatex(blocks: readonly QuestionLatexBlock[]): ComposedLatex {
  const joined = blocks.flatMap((entry) => entry.lines).join("\n");
  const latex = joined.trim();

  const dropped = joined.length - joined.trimStart().length;
  const droppedLines = joined.slice(0, dropped).split("\n").length - 1;

  const spans: QuestionLatexSpan[] = [];
  let cursor = 1 - droppedLines;

  for (const entry of blocks) {
    spans.push({
      origin: entry.origin,
      startLine: cursor,
      lineCount: entry.lines.length,
      textStartLine: cursor + entry.prefixLines,
    });
    cursor += entry.lines.length;
  }

  return { latex, spans };
}

/** O corpo, para quem não precisa do mapa. Uma linha, para não existirem duas montagens. */
export const latexFromBlocks = (blocks: readonly QuestionLatexBlock[]): string =>
  composeLatex(blocks).latex;

/**
 * Onde, no editor, fica a linha `line` do corpo compilado.
 *
 * `null` quando a linha não pertence a bloco nenhum — o que o `trim` cortou, e número fora do
 * corpo. Nesses casos não apontar é a resposta certa: mandar o cursor para "mais ou menos ali" é
 * pior que dizer que não se sabe.
 */
export function locateLatexLine(
  spans: readonly QuestionLatexSpan[],
  line: number,
): { readonly origin: QuestionLatexOrigin; readonly line: number } | null {
  const span = spans.find(
    (entry) => line >= entry.startLine && line < entry.startLine + entry.lineCount,
  );
  if (span === undefined) return null;

  // Linha de estrutura (o `\medskip`, o `\begin{enumerate}`) cai no começo do texto: é o lugar
  // mais próximo que a pessoa pode de fato editar.
  return { origin: span.origin, line: Math.max(1, line - span.textStartLine + 1) };
}

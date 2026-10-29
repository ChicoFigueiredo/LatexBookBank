import { REVIEW_SOURCES } from "@modules/questions/domain/to-review";

import type { NodeKind } from "./node-kind";

/**
 * O corpo do nó estrutural (D42, ADR 0001): a teoria da seção, em LaTeX.
 *
 * Só nó estrutural tem corpo. A questão já tem enunciado, resolução e complemento; dar corpo ao nó
 * dela criaria dois lugares para o mesmo texto.
 */

const WITH_BODY: ReadonlySet<NodeKind> = new Set([
  "BOOK",
  "PART",
  "CHAPTER",
  "SECTION",
  "SUBSECTION",
  "CONTENT",
  "QUESTION_GROUP",
  "NOTE",
  "FIGURE",
  "EXAMPLE",
]);

export const canHaveBody = (kind: NodeKind): boolean => WITH_BODY.has(kind);

/** Um limite generoso: um capítulo inteiro de teoria cabe, e um arquivo colado por engano não. */
export const MAX_BODY_LENGTH = 400_000;

export class InvalidNodeBodyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidNodeBodyError";
  }
}

export function parseBody(value: unknown): string {
  if (typeof value !== "string") throw new InvalidNodeBodyError("O corpo precisa ser texto.");
  if (value.length > MAX_BODY_LENGTH) {
    throw new InvalidNodeBodyError("O corpo passou do limite; divida a seção.");
  }
  return value;
}

/**
 * Acrescenta um trecho ao fim do corpo, separado por parágrafo. É o que a aprovação do scan faz
 * com a teoria, o exemplo e a nota de uma seção, na ordem em que o livro os traz.
 */
export function appendToBody(body: string, piece: string): string {
  const addition = piece.trim();
  if (addition === "") return body;
  const current = body.trimEnd();
  return current === "" ? addition : `${current}\n\n${addition}`;
}

/**
 * Acrescenta um trecho ao corpo **no lugar dele**: antes do primeiro dos trechos seguintes que o
 * corpo já tem (#248, CAP-04).
 *
 * A aprovação em rodadas traz o parágrafo do meio da seção depois do que vem em seguida no livro.
 * `followedBy` é o que já entrou e vem depois deste, na ordem do livro; o trecho só conta quando
 * começa um parágrafo — um pedaço de texto no meio de outro não é lugar. Se nenhum está mais lá
 * (alguém editou o corpo), o trecho vai para o fim, como `appendToBody`.
 */
export function insertIntoBody(body: string, piece: string, followedBy: readonly string[]): string {
  const addition = piece.trim();
  if (addition === "") return body;
  for (const next of followedBy) {
    const at = paragraphStart(body, next.trim());
    if (at === -1) continue;
    return `${body.slice(0, at)}${addition}\n\n${body.slice(at)}`;
  }
  return appendToBody(body, piece);
}

function paragraphStart(body: string, paragraph: string, from = 0): number {
  if (paragraph === "") return -1;
  for (let at = body.indexOf(paragraph, from); at !== -1; at = body.indexOf(paragraph, at + 1)) {
    if (at === 0 || body.slice(0, at).endsWith("\n\n")) return at;
  }
  return -1;
}

/**
 * Retira do corpo os trechos que a importação acrescentou (#249, CAP-09): o inverso de
 * `insertIntoBody`, para o nó que fica de pé quando a importação é apagada.
 *
 * Só sai o trecho que ainda é um parágrafo inteiro do corpo, igual ao que entrou. O que alguém
 * reescreveu à mão já não é o texto da máquina, e fica — nada editado à mão se perde (ADR 0006).
 */
export function removeFromBody(body: string, pieces: readonly string[]): string {
  let current = body;
  for (const piece of pieces) {
    const wanted = piece.trim();
    if (wanted === "") continue;
    for (
      let at = paragraphStart(current, wanted);
      at !== -1;
      at = paragraphStart(current, wanted, at + 1)
    ) {
      const end = at + wanted.length;
      // O trecho inteiro, até o fim do corpo ou até o próximo parágrafo — não o começo de outro.
      if (end !== current.length && !current.startsWith("\n\n", end)) continue;
      const before = current.slice(0, at).replace(/\n\n$/, "");
      const after = current.slice(end).replace(/^\n\n/, "");
      current = before === "" || after === "" ? `${before}${after}` : `${before}\n\n${after}`;
      break;
    }
  }
  return current;
}

/** O que a revisão guarda do nó: o estado anterior, para diff e restauração. */
export interface NodeBodySnapshot {
  readonly title: string | null;
  readonly bodyLatex: string;
}

/** O resumo da revisão que a aprovação do scan deixa ao acrescentar ao corpo do nó. */
export const BODY_FROM_SCAN = "corpo recebido do scan";

/** O que a árvore sabe do corpo de um nó para responder *a revisar*. Nada aqui é decisão. */
export interface BodyReviewFacts {
  /** O corpo tem texto. Corpo vazio não tem o que conferir. */
  readonly hasBody: boolean;
  /** O método da âncora principal do nó — `scan:` e `recognition:` são de máquina. */
  readonly anchorMethod: string | null;
  /** A última revisão do nó, quando há alguma. */
  readonly lastRevision: { readonly origin: string; readonly summary: string } | null;
}

/**
 * *A revisar* para o corpo de um nó (D40, ADR 0004, #252): o exemplo e a teoria que a aprovação
 * do scan escreveu, e que ninguém leu.
 *
 * Derivado, como o da questão, e sem coluna: o corpo tem texto **e** a última mão que o escreveu
 * foi a do scan — a revisão que a aprovação deixa ao acrescentar ao corpo (`BODY_FROM_SCAN`), ou
 * nenhuma revisão num nó com âncora de máquina, que nasceu já com o texto (o exemplo, D56).
 * Editar o corpo ou conferi-lo deixa uma revisão de pessoa, e a pergunta passa a responder "não"
 * — até uma aprovação seguinte acrescentar texto novo, que volta a pedir leitura.
 */
export function isBodyToReview(facts: BodyReviewFacts): boolean {
  if (!facts.hasBody) return false;
  if (facts.lastRevision !== null) {
    return facts.lastRevision.origin === "SYSTEM" && facts.lastRevision.summary === BODY_FROM_SCAN;
  }
  return (
    facts.anchorMethod !== null &&
    REVIEW_SOURCES.some((prefix) => facts.anchorMethod?.startsWith(prefix))
  );
}

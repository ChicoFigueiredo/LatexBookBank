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

function paragraphStart(body: string, paragraph: string): number {
  if (paragraph === "") return -1;
  for (let at = body.indexOf(paragraph); at !== -1; at = body.indexOf(paragraph, at + 1)) {
    if (at === 0 || body.slice(0, at).endsWith("\n\n")) return at;
  }
  return -1;
}

/** O que a revisão guarda do nó: o estado anterior, para diff e restauração. */
export interface NodeBodySnapshot {
  readonly title: string | null;
  readonly bodyLatex: string;
}

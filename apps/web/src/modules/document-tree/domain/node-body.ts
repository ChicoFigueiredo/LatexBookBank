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

/** O que a revisão guarda do nó: o estado anterior, para diff e restauração. */
export interface NodeBodySnapshot {
  readonly title: string | null;
  readonly bodyLatex: string;
}

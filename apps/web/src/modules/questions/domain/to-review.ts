/**
 * *A revisar* (D40): uma questão que uma máquina escreveu e ninguém leu.
 *
 * Derivado, não guardado: rascunho (`DRAFT`) cuja âncora principal veio do scan ou do
 * reconhecimento. Sem coluna nova, sem valor novo no enum, sem tag automática — o dado durável já
 * existe, e o estado é uma pergunta sobre ele. Conferir promove para `READY`, e a pergunta passa a
 * responder "não".
 */

/** Os métodos de extração que são de máquina — `scan:book-v1@1`, `recognition:<provider>`. */
export const REVIEW_SOURCES = ["scan:", "recognition:"] as const;

export function isToReview(question: {
  readonly status: string;
  readonly anchorMethod: string | null;
}): boolean {
  return (
    question.status === "DRAFT" &&
    question.anchorMethod !== null &&
    REVIEW_SOURCES.some((prefix) => question.anchorMethod?.startsWith(prefix))
  );
}

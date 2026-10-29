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

/** O que a árvore sabe do corpo de um nó para responder *a revisar*. Nada aqui é decisão. */
export interface BodyReviewFacts {
  /** O corpo tem texto. Corpo vazio não tem o que conferir. */
  readonly hasBody: boolean;
  /** O método da âncora principal do nó — `scan:` e `recognition:` são de máquina. */
  readonly anchorMethod: string | null;
  /** A origem da última revisão do nó (`USER`, `AGENT`, `SYSTEM`, `IMPORT`); `null` sem nenhuma. */
  readonly lastRevisionOrigin: string | null;
}

/**
 * *A revisar* para o corpo de um nó (D40, ADR 0004, #252): o exemplo e a teoria que a aprovação
 * do scan escreveu, e que ninguém leu.
 *
 * Derivado, como o da questão, e sem coluna: o corpo tem texto **e** a última mão que o escreveu
 * foi de máquina — a revisão `SYSTEM` que a aprovação deixa ao acrescentar ao corpo, ou nenhuma
 * revisão num nó que nasceu do scan já com o texto (o exemplo, D56). Editar o corpo ou conferi-lo
 * deixa uma revisão `USER`, e a pergunta passa a responder "não" — até uma aprovação seguinte
 * acrescentar texto novo, que volta a pedir leitura.
 */
export function isBodyToReview(facts: BodyReviewFacts): boolean {
  if (!facts.hasBody) return false;
  if (facts.lastRevisionOrigin !== null) return facts.lastRevisionOrigin === "SYSTEM";
  return (
    facts.anchorMethod !== null &&
    REVIEW_SOURCES.some((prefix) => facts.anchorMethod?.startsWith(prefix))
  );
}

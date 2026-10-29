/**
 * Revisão: o estado de uma entidade **antes** de uma mudança, numerado por entidade (ARQ-04).
 *
 * O Histórico de uma questão e o de um nó são a mesma tabela, com a mesma numeração: sequencial
 * por `(entityType, entityId)`, contada dentro da transação que muda a entidade. O formato do
 * snapshot é do dono da entidade — a questão grava o `QuestionState` do agente, o nó grava
 * `{ title, bodyLatex }` —, e este módulo só guarda e numera.
 */

export const REVISION_ENTITY_TYPES = [
  "QUESTION",
  "QUESTION_OPTION",
  "DOCUMENT_NODE",
  "PUBLICATION",
] as const;

export type RevisionEntityType = (typeof REVISION_ENTITY_TYPES)[number];

export const REVISION_ORIGINS = ["USER", "IMPORT", "AGENT", "SYSTEM"] as const;

export type RevisionOrigin = (typeof REVISION_ORIGINS)[number];

export interface NewRevision {
  readonly entityType: RevisionEntityType;
  readonly entityId: string;
  readonly origin: RevisionOrigin;
  /** Uma frase sobre o que mudou: é o que a linha do tempo mostra antes de abrir o diff. */
  readonly summary: string;
  /** O estado anterior, já serializado pelo dono da entidade. */
  readonly snapshotJson: string;
  /** O turno do agente, quando `origin` é `AGENT`. */
  readonly agentRunId?: string | null;
}

export interface RevisionRecord {
  readonly revisionNumber: number;
  readonly origin: string;
  readonly summary: string;
  readonly snapshotJson: string;
  readonly createdAt: Date;
}

/** A linha da timeline: sem o snapshot, que pode ser grande. */
export type RevisionEntry = Omit<RevisionRecord, "snapshotJson">;

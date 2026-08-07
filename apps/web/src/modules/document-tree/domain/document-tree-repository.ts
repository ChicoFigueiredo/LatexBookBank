import type { NodeKind, NumberingStyle } from "./node-kind";

/**
 * Porta de leitura da árvore de conteúdo.
 *
 * A árvore vem **achatada**, com `parentId` e `sortKey`, e a hierarquia é montada em memória
 * por `buildTree`. Uma consulta recursiva no banco custaria uma ida por nível e amarraria a
 * leitura a recursos de CTE que variam entre SQLite e PostgreSQL — exatamente o tipo de
 * dependência de motor que a Fase 6.5 existe para não encontrar.
 */

export interface TreeNodeRecord {
  readonly id: string;
  readonly parentId: string | null;
  readonly kind: NodeKind;
  readonly title: string | null;
  readonly sortKey: string;
  readonly numberingStyle: NumberingStyle;
  readonly originalLabel: string | null;
  readonly question: TreeQuestionRecord | null;
}

export interface TreeQuestionRecord {
  readonly id: string;
  readonly type: string;
  readonly statementLatex: string;
  readonly difficulty: number;
  readonly board: string | null;
  readonly year: number | null;
  readonly options: readonly TreeOptionRecord[];
}

export interface TreeOptionRecord {
  readonly id: string;
  readonly sortKey: string;
  readonly statementLatex: string;
  readonly isCorrect: boolean;
}

export interface DocumentTreeRepository {
  /** Nós não excluídos de uma publicação, já ordenados por `sortKey`. */
  listByPublication(publicationId: string): Promise<readonly TreeNodeRecord[]>;
}

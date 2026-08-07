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
  readonly updatedAt: Date;
  readonly statementLatex: string;
  readonly solutionLatex: string;
  readonly complementLatex: string;
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

/** Dados de criação de um nó. `sortKey` e `parentId` vêm resolvidos pelo domínio. */
export interface NewNode {
  readonly publicationId: string;
  readonly parentId: string | null;
  readonly kind: NodeKind;
  readonly title: string | null;
  readonly sortKey: string;
  readonly numberingStyle?: NumberingStyle;
}

/**
 * Porta de escrita da árvore.
 *
 * Separada da leitura de propósito: quase todo consumidor só lê, e um contrato que exige
 * implementar escrita para renderizar uma árvore empurraria stub vazio para dentro de teste.
 *
 * Nenhum método aqui decide regra. Ciclo, posição e ordem são resolvidos no domínio antes de
 * chegar; o que estas funções fazem é gravar o que já foi decidido.
 */
export interface DocumentTreeWriter {
  create(node: NewNode): Promise<string>;

  rename(nodeId: string, title: string | null): Promise<void>;

  move(nodeId: string, parentId: string | null, sortKey: string): Promise<void>;

  /**
   * Exclusão lógica de um conjunto de nós, em uma transação.
   *
   * Recebe a lista inteira — nó e descendentes — porque excluir só o pai deixaria os filhos
   * apontando para um nó excluído: eles sumiriam da árvore sem estar marcados, e voltariam
   * sozinhos se alguém restaurasse o pai.
   */
  softDeleteMany(nodeIds: readonly string[]): Promise<void>;

  restoreMany(nodeIds: readonly string[]): Promise<void>;

  /** Nós excluídos de uma publicação — a lixeira, e o que `restore` precisa consultar. */
  listDeleted(publicationId: string): Promise<readonly DeletedNodeRecord[]>;

  /**
   * Duplica uma subárvore inteira, em uma transação, e devolve o id da nova raiz.
   *
   * Recebe o plano em pré-ordem já resolvido pelo domínio (`planDuplicate`). A tradução de
   * `sourceId` para o id novo do pai é feita aqui, dentro da transação, porque é onde os ids
   * nascem — o domínio não tem como saber.
   */
  duplicateSubtree(publicationId: string, plan: readonly PlannedNode[]): Promise<string>;
}

/** Espelha `PlannedNode` de `tree-mutations`, sem criar dependência de domínio → domínio. */
export interface PlannedNode {
  readonly sourceId: string;
  readonly parentId: string | null;
  readonly sortKey: string;
}

export interface DeletedNodeRecord {
  readonly id: string;
  readonly parentId: string | null;
  readonly title: string | null;
  readonly kind: NodeKind;
  readonly deletedAt: Date;
}

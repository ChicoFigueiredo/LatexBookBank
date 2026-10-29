import type { Prisma } from "@/generated/prisma/client";
import { planNodeAnchors, type NodeAnchorLink } from "@modules/assets/domain/node-anchors";
import { writeNodeAnchors } from "@modules/assets/infrastructure/prisma-node-anchor-writer";
import {
  insertQuestion,
  type QuestionToInsert,
} from "@modules/questions/infrastructure/prisma-question-writer";

/**
 * O escritor de nó: o nó, a questão que ele carrega e as âncoras, numa transação que já existe
 * (ARQ-01 da revisão de 2026-09-23).
 *
 * É o caminho de todo nó que nasce no acervo com conteúdo — a criação manual de questão, a
 * aprovação do scan, duplicar, o `.lbb` e o import legado. A ordem é a do banco: a questão
 * primeiro (`DocumentNode.questionId` é a chave estrangeira), o nó, e as âncoras por último, por
 * `writeNodeAnchors`, que é quem mantém `sourceAnchorId` do nó e da questão iguais à principal da
 * lista. Nenhum chamador grava essa coluna à mão.
 *
 * Sem `server-only` e sem o cliente do módulo, pelo mesmo motivo do escritor de questão: o import
 * legado chega aqui pela linha de comando, com a transação dele.
 */

type Tx = Prisma.TransactionClient;

/** As colunas do nó que quem cria escolhe; `questionId` e `sourceAnchorId` são decididos aqui. */
export type NewNodeColumns = Pick<
  Prisma.DocumentNodeUncheckedCreateInput,
  | "publicationId"
  | "parentId"
  | "kind"
  | "title"
  | "slug"
  | "sortKey"
  | "numberingStyle"
  | "originalLabel"
  | "bodyLatex"
  | "legacyId"
  | "deletedAt"
  | "createdByScanRunId"
>;

export interface NodeToInsert {
  readonly columns: NewNodeColumns;
  /** A questão que o nó carrega, quando é nó de questão. */
  readonly question?: QuestionToInsert | null;
  /**
   * As âncoras, em ordem de leitura e com papel. Ausente ou vazia, o nó nasce sem origem — e quem
   * só as conhece depois (o `.lbb`, cujo recorte pode ser a figura de uma questão que vem adiante
   * no arquivo) chama `writeNodeAnchors` quando souber.
   */
  readonly anchors?: readonly NodeAnchorLink[];
}

export interface InsertedNode {
  readonly nodeId: string;
  readonly questionId: string | null;
  readonly optionIds: readonly string[];
  readonly sortKey: string;
}

export async function insertNode(tx: Tx, input: NodeToInsert): Promise<InsertedNode> {
  const question = input.question ? await insertQuestion(tx, input.question) : null;

  const node = await tx.documentNode.create({
    data: {
      ...input.columns,
      ...(question ? { questionId: question.questionId } : {}),
    },
    select: { id: true, sortKey: true },
  });

  // Sem âncora, as colunas já nasceram nulas: pular a escrita poupa quatro consultas por nó num
  // import de milhares de nós sem origem.
  if (input.anchors && input.anchors.length > 0) {
    await writeNodeAnchors(tx, node.id, planNodeAnchors(input.anchors));
  }

  return {
    nodeId: node.id,
    questionId: question?.questionId ?? null,
    optionIds: question?.optionIds ?? [],
    sortKey: node.sortKey,
  };
}

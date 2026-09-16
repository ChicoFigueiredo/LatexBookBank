import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@infrastructure/database/sqlite/client";
import {
  isAnchorRole,
  planNodeAnchors,
  type AnchorRole,
  type NodeAnchorLink,
  type NodeAnchorPlan,
} from "@modules/assets/domain/node-anchors";
import type { NormalizedBox } from "@modules/assets/domain/source-anchor";
import type {
  AnchoredQuestion,
  NodeAnchorEditor,
} from "@modules/assets/application/edit-node-anchors";

/**
 * As âncoras de um nó, gravadas e lidas (D50, ADR 0003).
 *
 * A regra que este adaptador protege é a sincronia com a coluna antiga: `sourceAnchorId` do nó
 * **e** da questão que ele carrega apontam sempre para a âncora principal da lista, na mesma
 * transação. Enquanto a aba Origem, a fila de captura e o `.lbb` v1 lerem a coluna, uma lista que
 * mudasse sem ela faria a questão mostrar uma origem e o nó outra.
 */

export interface NodeAnchorView {
  readonly sourceAnchorId: string;
  readonly role: AnchorRole;
  readonly sortOrder: number;
  readonly sourceAssetId: string;
  readonly cropAssetId: string | null;
  readonly pageNumber: number;
  readonly box: NormalizedBox;
}

type Tx = Prisma.TransactionClient;

/**
 * Reescreve a lista inteira dentro de uma transação que já existe.
 *
 * Exportado para os criadores (questão, aprovação do scan), que já estão numa transação e não
 * podem abrir outra — no SQLite, uma transação aninhada espera a de fora e trava.
 */
export async function writeNodeAnchors(tx: Tx, nodeId: string, plan: NodeAnchorPlan): Promise<void> {
  await tx.documentNodeAnchor.deleteMany({ where: { documentNodeId: nodeId } });

  if (plan.anchors.length > 0) {
    await tx.documentNodeAnchor.createMany({
      data: plan.anchors.map((anchor) => ({
        documentNodeId: nodeId,
        sourceAnchorId: anchor.sourceAnchorId,
        sortOrder: anchor.sortOrder,
        role: anchor.role,
      })),
    });
  }

  const node = await tx.documentNode.update({
    where: { id: nodeId },
    data: { sourceAnchorId: plan.primaryAnchorId },
    select: { questionId: true },
  });

  if (node.questionId) {
    await tx.question.update({
      where: { id: node.questionId },
      data: { sourceAnchorId: plan.primaryAnchorId },
    });
  }
}

const ANCHOR_SELECT = {
  sortOrder: true,
  role: true,
  sourceAnchor: {
    select: {
      id: true,
      sourceAssetId: true,
      cropAssetId: true,
      pageNumber: true,
      xNormalized: true,
      yNormalized: true,
      widthNormalized: true,
      heightNormalized: true,
    },
  },
} as const;

type AnchorRow = Prisma.DocumentNodeAnchorGetPayload<{ select: typeof ANCHOR_SELECT }>;

function toView(row: AnchorRow): NodeAnchorView {
  const anchor = row.sourceAnchor;

  return {
    sourceAnchorId: anchor.id,
    // Papel desconhecido no banco é dado antigo ou escrito à mão; ler como principal é o que não
    // esconde a âncora de ninguém.
    role: isAnchorRole(row.role) ? row.role : "PRIMARY",
    sortOrder: row.sortOrder,
    sourceAssetId: anchor.sourceAssetId,
    cropAssetId: anchor.cropAssetId,
    pageNumber: anchor.pageNumber,
    box: {
      x: anchor.xNormalized,
      y: anchor.yNormalized,
      width: anchor.widthNormalized,
      height: anchor.heightNormalized,
    },
  };
}

export class PrismaNodeAnchors implements NodeAnchorEditor {
  async findByQuestion(questionId: string): Promise<AnchoredQuestion | null> {
    const node = await prisma.documentNode.findUnique({
      where: { questionId },
      select: {
        id: true,
        publicationId: true,
        publication: { select: { sourcePdfAssetId: true } },
        anchors: {
          orderBy: { sortOrder: "asc" },
          select: { sourceAnchorId: true, role: true, sourceAnchor: { select: { sourceAssetId: true } } },
        },
      },
    });
    if (!node) return null;

    return {
      nodeId: node.id,
      publicationId: node.publicationId,
      links: node.anchors.map((link) => ({
        sourceAnchorId: link.sourceAnchorId,
        role: isAnchorRole(link.role) ? link.role : "PRIMARY",
      })),
      sourceAssetId: node.anchors[0]?.sourceAnchor.sourceAssetId ?? node.publication.sourcePdfAssetId,
    };
  }

  async createAnchor(input: Parameters<NodeAnchorEditor["createAnchor"]>[0]): Promise<string> {
    const anchor = await prisma.sourceAnchor.create({
      data: {
        publicationId: input.publicationId,
        sourceAssetId: input.sourceAssetId,
        pageNumber: input.pageNumber,
        xNormalized: input.box.x,
        yNormalized: input.box.y,
        widthNormalized: input.box.width,
        heightNormalized: input.box.height,
        extractionMethod: "manual:editor",
      },
      select: { id: true },
    });
    return anchor.id;
  }

  async replaceLinks(nodeId: string, links: readonly NodeAnchorLink[]): Promise<void> {
    await this.replace(nodeId, links);
  }

  async listForNode(nodeId: string): Promise<readonly NodeAnchorView[]> {
    const rows = await prisma.documentNodeAnchor.findMany({
      where: { documentNodeId: nodeId },
      orderBy: { sortOrder: "asc" },
      select: ANCHOR_SELECT,
    });

    return rows.map(toView);
  }

  /** A questão acha as suas âncoras pelo nó que a carrega (ADR 0003). */
  async listForQuestion(questionId: string): Promise<readonly NodeAnchorView[]> {
    const node = await prisma.documentNode.findUnique({
      where: { questionId },
      select: { id: true },
    });

    return node ? this.listForNode(node.id) : [];
  }

  async replace(nodeId: string, links: readonly NodeAnchorLink[]): Promise<void> {
    const plan = planNodeAnchors(links);

    await prisma.$transaction((tx) => writeNodeAnchors(tx, nodeId, plan));
  }
}

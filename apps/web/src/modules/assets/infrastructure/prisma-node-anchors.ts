import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@infrastructure/database/sqlite/client";
import {
  isAnchorRole,
  planNodeAnchors,
  type AnchorRole,
  type NodeAnchorLink,
} from "@modules/assets/domain/node-anchors";
import { writeNodeAnchors } from "@modules/assets/infrastructure/prisma-node-anchor-writer";
import type { NormalizedBox } from "@modules/assets/domain/source-anchor";
import type {
  AnchoredQuestion,
  NodeAnchorEditor,
} from "@modules/assets/application/edit-node-anchors";

/**
 * As âncoras de um nó, gravadas e lidas (D50, ADR 0003).
 *
 * A escrita passa sempre por `writeNodeAnchors` (`prisma-node-anchor-writer.ts`), que mantém a
 * coluna antiga `sourceAnchorId` do nó e da questão em sincronia com a lista.
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

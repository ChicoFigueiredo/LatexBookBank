import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import type {
  NodeBodyRecord,
  NodeBodyRepository,
} from "@modules/document-tree/application/save-node-body";
import { isNodeKind } from "@modules/document-tree/domain/node-kind";

const SELECT = {
  id: true,
  publicationId: true,
  kind: true,
  title: true,
  bodyLatex: true,
  updatedAt: true,
} as const;

function toRecord(row: {
  id: string;
  publicationId: string;
  kind: string;
  title: string | null;
  bodyLatex: string;
  updatedAt: Date;
}): NodeBodyRecord {
  return {
    nodeId: row.id,
    publicationId: row.publicationId,
    kind: isNodeKind(row.kind) ? row.kind : "CONTENT",
    title: row.title,
    bodyLatex: row.bodyLatex,
    updatedAt: row.updatedAt,
  };
}

export class PrismaNodeBodyRepository implements NodeBodyRepository {
  async find(publicationId: string, nodeId: string): Promise<NodeBodyRecord | null> {
    // A publicação no filtro é o guarda: o id de um nó de outro livro não serve aqui.
    const row = await prisma.documentNode.findFirst({
      where: { id: nodeId, publicationId, deletedAt: null },
      select: SELECT,
    });
    return row ? toRecord(row) : null;
  }

  /** O histórico do nó, do mais novo ao mais velho — o estado anterior de cada gravação. */
  async listRevisions(nodeId: string) {
    const rows = await prisma.revision.findMany({
      where: { entityType: "DOCUMENT_NODE", entityId: nodeId },
      orderBy: { revisionNumber: "desc" },
      take: 50,
      select: { revisionNumber: true, origin: true, summary: true, createdAt: true, snapshotJson: true },
    });
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }

  async workspaceOf(publicationId: string): Promise<string | null> {
    const row = await prisma.publication.findUnique({
      where: { id: publicationId },
      select: { workspaceId: true },
    });
    return row?.workspaceId ?? null;
  }

  async save(input: Parameters<NodeBodyRepository["save"]>[0]): Promise<NodeBodyRecord | null> {
    return prisma.$transaction(async (tx) => {
      // A versão vai **no `where`** (#259): ler, comparar e depois gravar deixa duas abas passarem
      // pela comparação juntas, e a segunda sobrescreve a primeira. Aqui o SQLite aplica a condição
      // na hora da escrita, e quem perde volta com `count: 0` — sem revisão gravada.
      const updated = await tx.documentNode.updateMany({
        where: { id: input.nodeId, updatedAt: input.expectedUpdatedAt },
        data: { bodyLatex: input.bodyLatex },
      });
      if (updated.count === 0) return null;

      const last = await tx.revision.findFirst({
        where: { entityType: "DOCUMENT_NODE", entityId: input.nodeId },
        orderBy: { revisionNumber: "desc" },
        select: { revisionNumber: true },
      });
      await tx.revision.create({
        data: {
          entityType: "DOCUMENT_NODE",
          entityId: input.nodeId,
          revisionNumber: (last?.revisionNumber ?? 0) + 1,
          origin: "USER",
          summary: input.summary,
          snapshotJson: JSON.stringify(input.previous),
        },
      });
      const row = await tx.documentNode.findUniqueOrThrow({
        where: { id: input.nodeId },
        select: SELECT,
      });
      return toRecord(row);
    });
  }
}

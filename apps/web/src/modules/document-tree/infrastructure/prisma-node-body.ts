import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@infrastructure/database/sqlite/client";
import type {
  NodeBodyRecord,
  NodeBodyRepository,
} from "@modules/document-tree/application/save-node-body";
import type { NodeBodySnapshot } from "@modules/document-tree/domain/node-body";
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

/** A revisão `USER` do nó, com o número seguinte contado dentro da transação. */
async function writeUserRevision(
  tx: Prisma.TransactionClient,
  nodeId: string,
  summary: string,
  snapshot: NodeBodySnapshot,
): Promise<void> {
  const last = await tx.revision.findFirst({
    where: { entityType: "DOCUMENT_NODE", entityId: nodeId },
    orderBy: { revisionNumber: "desc" },
    select: { revisionNumber: true },
  });
  await tx.revision.create({
    data: {
      entityType: "DOCUMENT_NODE",
      entityId: nodeId,
      revisionNumber: (last?.revisionNumber ?? 0) + 1,
      origin: "USER",
      summary,
      snapshotJson: JSON.stringify(snapshot),
    },
  });
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

  async recordReview(input: Parameters<NodeBodyRepository["recordReview"]>[0]): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await writeUserRevision(tx, input.nodeId, input.summary, input.current);
    });
  }

  async save(input: Parameters<NodeBodyRepository["save"]>[0]): Promise<NodeBodyRecord> {
    return prisma.$transaction(async (tx) => {
      await writeUserRevision(tx, input.nodeId, input.summary, input.previous);
      const row = await tx.documentNode.update({
        where: { id: input.nodeId },
        data: { bodyLatex: input.bodyLatex },
        select: SELECT,
      });
      return toRecord(row);
    });
  }
}

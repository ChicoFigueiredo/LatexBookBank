import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import type { Tx } from "@infrastructure/database/sqlite/transaction";
import type {
  NodeBodyRecord,
  NodeBodyRepository,
} from "@modules/document-tree/application/save-node-body";
import type { NodeBodySnapshot } from "@modules/document-tree/domain/node-body";
import { isNodeKind } from "@modules/document-tree/domain/node-kind";
import type { RevisionOrigin } from "@modules/revisions/domain/revision";
import { listRevisionsWithSnapshots } from "@modules/revisions/infrastructure/prisma-revision-reader";
import { appendRevision } from "@modules/revisions/infrastructure/prisma-revision-writer";

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

/**
 * A revisão do nó, com o snapshot no formato deste módulo (`NodeBodySnapshot`).
 *
 * Exportada para quem muda o corpo por fora do editor — a aprovação do scan, a retirada de uma
 * importação —, que antes montava o snapshot à mão: a aba Histórico de um nó lê todos os snapshots
 * com o mesmo formato, e é aqui que ele mora. A numeração é do módulo de revisões.
 */
export async function appendNodeRevision(
  tx: Tx,
  input: {
    readonly nodeId: string;
    readonly origin: RevisionOrigin;
    readonly summary: string;
    readonly snapshot: NodeBodySnapshot;
  },
): Promise<number> {
  const snapshot: NodeBodySnapshot = {
    title: input.snapshot.title,
    bodyLatex: input.snapshot.bodyLatex,
  };
  return appendRevision(tx, {
    entityType: "DOCUMENT_NODE",
    entityId: input.nodeId,
    origin: input.origin,
    summary: input.summary,
    snapshotJson: JSON.stringify(snapshot),
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
    const rows = await listRevisionsWithSnapshots("DOCUMENT_NODE", nodeId);
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
      await appendNodeRevision(tx, {
        nodeId: input.nodeId,
        origin: "USER",
        summary: input.summary,
        snapshot: input.current,
      });
    });
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

      await appendNodeRevision(tx, {
        nodeId: input.nodeId,
        origin: "USER",
        summary: input.summary,
        snapshot: input.previous,
      });
      const row = await tx.documentNode.findUniqueOrThrow({
        where: { id: input.nodeId },
        select: SELECT,
      });
      return toRecord(row);
    });
  }
}

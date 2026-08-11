import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";

/**
 * Leitura de revisões.
 *
 * Separado do aplicador porque é leitura pura e porque a Fase 10 vai ler daqui para a aba
 * Histórico. Também é o que garante que o snapshot restaurado venha do banco: aceitar um snapshot
 * enviado pelo cliente seria escrita arbitrária disfarçada de "desfazer".
 */

export interface RevisionRecord {
  readonly revisionNumber: number;
  readonly origin: string;
  readonly summary: string;
  readonly snapshotJson: string;
  readonly createdAt: Date;
}

export async function findRevision(
  questionId: string,
  revisionNumber: number,
): Promise<RevisionRecord | null> {
  return prisma.revision.findUnique({
    where: {
      entityType_entityId_revisionNumber: {
        entityType: "QUESTION",
        entityId: questionId,
        revisionNumber,
      },
    },
    select: {
      revisionNumber: true,
      origin: true,
      summary: true,
      snapshotJson: true,
      createdAt: true,
    },
  });
}

/** As revisões de uma questão, da mais recente para a mais antiga. */
export async function listRevisions(
  questionId: string,
  limit = 50,
): Promise<readonly Omit<RevisionRecord, "snapshotJson">[]> {
  return prisma.revision.findMany({
    where: { entityType: "QUESTION", entityId: questionId },
    orderBy: { revisionNumber: "desc" },
    take: limit,
    select: { revisionNumber: true, origin: true, summary: true, createdAt: true },
  });
}

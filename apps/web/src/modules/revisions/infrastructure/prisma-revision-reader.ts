import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import type {
  RevisionEntityType,
  RevisionEntry,
  RevisionRecord,
} from "@modules/revisions/domain/revision";

/**
 * Leitura de revisões, de questão ou de nó.
 *
 * Separado do escritor porque é leitura pura, e é o que garante que o snapshot restaurado venha
 * do banco: aceitar um snapshot enviado pelo cliente seria escrita arbitrária disfarçada de
 * "desfazer".
 */

export async function findRevision(
  entityType: RevisionEntityType,
  entityId: string,
  revisionNumber: number,
): Promise<RevisionRecord | null> {
  return prisma.revision.findUnique({
    where: {
      entityType_entityId_revisionNumber: { entityType, entityId, revisionNumber },
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

/** As revisões de uma entidade, da mais recente para a mais antiga, sem os snapshots. */
export async function listRevisions(
  entityType: RevisionEntityType,
  entityId: string,
  limit = 50,
): Promise<readonly RevisionEntry[]> {
  return prisma.revision.findMany({
    where: { entityType, entityId },
    orderBy: { revisionNumber: "desc" },
    take: limit,
    select: { revisionNumber: true, origin: true, summary: true, createdAt: true },
  });
}

/**
 * As mesmas, com os snapshots: o histórico do corpo do nó mostra o texto anterior de cada
 * gravação na própria lista, e um corpo é pequeno o bastante para isso.
 */
export async function listRevisionsWithSnapshots(
  entityType: RevisionEntityType,
  entityId: string,
  limit = 50,
): Promise<readonly RevisionRecord[]> {
  return prisma.revision.findMany({
    where: { entityType, entityId },
    orderBy: { revisionNumber: "desc" },
    take: limit,
    select: {
      revisionNumber: true,
      origin: true,
      summary: true,
      createdAt: true,
      snapshotJson: true,
    },
  });
}

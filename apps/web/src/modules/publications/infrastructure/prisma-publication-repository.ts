import "server-only";

import type {
  PublicationRepository,
  PublicationSummary,
} from "@modules/publications/domain/publication-repository";
import { prisma } from "@infrastructure/database/sqlite/client";

/**
 * Implementação Prisma de `PublicationRepository`.
 *
 * A projeção acontece **aqui**, na fronteira: o que sai já é o tipo do domínio, não uma linha do
 * Prisma. Devolver a entidade crua espalharia o formato do banco por todo lado e faria a troca
 * de motor da Fase 6.5 vazar para fora desta camada.
 */
export class PrismaPublicationRepository implements PublicationRepository {
  async listByWorkspaceSlug(slug: string): Promise<readonly PublicationSummary[]> {
    const rows = await prisma.publication.findMany({
      where: { workspace: { slug } },
      orderBy: { title: "asc" },
      select: {
        id: true,
        workspaceId: true,
        title: true,
        nickname: true,
        publisher: true,
        _count: { select: { nodes: true } },
      },
    });

    return rows.map(toSummary);
  }

  async findById(id: string): Promise<PublicationSummary | null> {
    const row = await prisma.publication.findUnique({
      where: { id },
      select: {
        id: true,
        workspaceId: true,
        title: true,
        nickname: true,
        publisher: true,
        _count: { select: { nodes: true } },
      },
    });

    return row ? toSummary(row) : null;
  }
}

interface PublicationRow {
  id: string;
  workspaceId: string;
  title: string;
  nickname: string | null;
  publisher: string | null;
  _count: { nodes: number };
}

const toSummary = (row: PublicationRow): PublicationSummary => ({
  id: row.id,
  workspaceId: row.workspaceId,
  title: row.title,
  nickname: row.nickname,
  publisher: row.publisher,
  nodeCount: row._count.nodes,
});

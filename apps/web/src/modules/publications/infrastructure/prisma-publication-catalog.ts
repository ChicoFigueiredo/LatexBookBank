import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";

/**
 * O catálogo de publicações do acervo inteiro, com o nome da biblioteca junto.
 *
 * Read model separado do `PublicationRepository` de propósito: o repositório serve o agregado
 * `Publication` e não conhece `Workspace` além do id. Esta consulta existe para **uma tela** — a
 * lista de publicações do rail —, e é onde a junção com a biblioteca pertence.
 */

export interface CatalogEntry {
  readonly id: string;
  readonly title: string;
  readonly libraryName: string;
  readonly librarySlug: string;
  readonly questionCount: number;
  readonly updatedAt: Date;
}

export async function listPublicationCatalog(): Promise<readonly CatalogEntry[]> {
  const rows = await prisma.publication.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      workspace: { select: { name: true, slug: true } },
    },
  });

  if (rows.length === 0) return [];

  const groups = await prisma.documentNode.groupBy({
    by: ["publicationId"],
    where: { deletedAt: null, questionId: { not: null } },
    _count: { _all: true },
  });
  const counts = new Map(groups.map((group) => [group.publicationId, group._count._all]));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    libraryName: row.workspace.name,
    librarySlug: row.workspace.slug,
    questionCount: counts.get(row.id) ?? 0,
    updatedAt: row.updatedAt,
  }));
}

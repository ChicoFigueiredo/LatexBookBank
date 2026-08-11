import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import { slugifyLibrary } from "@modules/workspaces/domain/library";
import type {
  LibraryRepository,
  LibrarySummary,
} from "@modules/workspaces/domain/library-repository";

/**
 * Implementação Prisma de `LibraryRepository`.
 *
 * A projeção acontece aqui, na fronteira: o que sai já é o tipo do domínio.
 */
export class PrismaLibraryRepository implements LibraryRepository {
  async list(): Promise<readonly LibrarySummary[]> {
    const rows = await prisma.workspace.findMany({
      orderBy: { name: "asc" },
      select: SELECT,
    });
    return rows.map(toSummary);
  }

  async findById(id: string): Promise<LibrarySummary | null> {
    const row = await prisma.workspace.findUnique({ where: { id }, select: SELECT });
    return row ? toSummary(row) : null;
  }

  async findBySlug(slug: string): Promise<LibrarySummary | null> {
    const row = await prisma.workspace.findUnique({ where: { slug }, select: SELECT });
    return row ? toSummary(row) : null;
  }

  async listSlugs(): Promise<readonly string[]> {
    const rows = await prisma.workspace.findMany({ select: { slug: true } });
    return rows.map((row) => row.slug);
  }

  /**
   * Comparação sem caixa nem acento, **em memória**.
   *
   * `mode: "insensitive"` não existe no conector SQLite, e `LOWER()` do SQLite só rebaixa ASCII —
   * "Matemática" e "matemática" passariam, "MATEMÁTICA" não. Com dezenas de bibliotecas, comparar
   * os slugs derivados em memória é exato e custa uma consulta de uma coluna.
   */
  async existsByName(name: string): Promise<boolean> {
    const target = slugifyLibrary(name);
    const rows = await prisma.workspace.findMany({ select: { name: true } });
    return rows.some((row) => slugifyLibrary(row.name) === target);
  }

  async create(input: { name: string; slug: string }): Promise<LibrarySummary> {
    const row = await prisma.workspace.create({
      data: { name: input.name, slug: input.slug },
      select: SELECT,
    });
    return toSummary(row);
  }

  async rename(id: string, name: string): Promise<LibrarySummary | null> {
    const row = await prisma.workspace.update({ where: { id }, data: { name }, select: SELECT });
    return row ? toSummary(row) : null;
  }
}

const SELECT = {
  id: true,
  name: true,
  slug: true,
  updatedAt: true,
  _count: { select: { publications: true } },
} as const;

interface Row {
  id: string;
  name: string;
  slug: string;
  updatedAt: Date;
  _count: { publications: number };
}

const toSummary = (row: Row): LibrarySummary => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  publicationCount: row._count.publications,
  updatedAt: row.updatedAt,
});

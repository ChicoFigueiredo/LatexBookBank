import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import { slugifyLibrary } from "@modules/workspaces/domain/library";
import type {
  LibraryContents,
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

  async create(input: {
    name: string;
    slug: string;
    description: string | null;
  }): Promise<LibrarySummary> {
    const row = await prisma.workspace.create({
      data: { name: input.name, slug: input.slug, description: input.description },
      select: SELECT,
    });
    return toSummary(row);
  }

  async rename(id: string, name: string): Promise<LibrarySummary | null> {
    const row = await prisma.workspace.update({ where: { id }, data: { name }, select: SELECT });
    return row ? toSummary(row) : null;
  }

  async contentsOf(id: string): Promise<LibraryContents | null> {
    const row = await prisma.workspace.findUnique({
      where: { id },
      select: { _count: { select: { publications: true, assets: true } } },
    });
    if (!row) return null;

    return {
      publicationCount: row._count.publications,
      assetCount: row._count.assets,
      // `Question` não tem `workspaceId`: só se chega a ela pelo nó que a aponta. Contar pela
      // relação é o mesmo caminho que a exclusão vai percorrer — se um dia divergirem, o número
      // do diálogo mentiria sobre o que some.
      questionCount: await prisma.question.count({ where: questionsOf(id) }),
    };
  }

  async listAssetKeys(id: string): Promise<readonly string[]> {
    const rows = await prisma.asset.findMany({
      where: { workspaceId: id },
      select: { storageKey: true },
      distinct: ["storageKey"],
    });
    return rows.map((row) => row.storageKey);
  }

  /**
   * Exclusão permanente, numa transação e **em ordem explícita**.
   *
   * A cascata do banco sozinha não faz o serviço, e o motivo não é teórico: contra o banco de
   * desenvolvimento, `DELETE` no workspace devolvia `P2003 ForeignKeyConstraintViolation`. São
   * três coisas distintas, e cada uma explica um dos passos abaixo.
   *
   *   1. **`AssessmentItem.question` é `RESTRICT`.** Apagar uma questão que está numa avaliação
   *      aborta a transação inteira. Por isso as avaliações saem primeiro.
   *   2. **`SourceAnchor.sourceAsset` é `RESTRICT`** — a outra das duas únicas arestas assim no
   *      schema, e a que de fato derrubou o teste. Ela não aparece no caminho óbvio: apagar a
   *      questão cascateia para os `RenderJob` dela, que cascateiam para os assets do render, e é
   *      no asset que a âncora trava. Por isso as âncoras saem antes das questões.
   *   3. **`Question` não pende de `Workspace`.** Quem aponta para ela é `DocumentNode`, e a
   *      cascata só desce. Confiar nela deixaria a questão órfã no banco para sempre — invisível
   *      na tela e pesando no arquivo.
   *
   * O resto (publicações, nós, assets, tags, jobs, templates) desce por cascata a partir do
   * workspace, que é o que a cascata realmente sabe fazer.
   */
  async delete(id: string): Promise<boolean> {
    const exists = await prisma.workspace.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return false;

    await prisma.$transaction([
      prisma.assessment.deleteMany({ where: { workspaceId: id } }),
      // `SourceAnchor` não tem `workspaceId`: quem a escopa é a publicação.
      prisma.sourceAnchor.deleteMany({ where: { publication: { workspaceId: id } } }),
      // `ScanRun.sourceAsset` é a terceira aresta `RESTRICT` (D51): a execução aponta para o PDF
      // fonte que varreu, e sai antes dos assets. Páginas e itens descem por cascata dela.
      prisma.scanRun.deleteMany({ where: { workspaceId: id } }),
      prisma.question.deleteMany({ where: questionsOf(id) }),
      prisma.workspace.delete({ where: { id } }),
    ]);

    return true;
  }
}

/** As questões de uma biblioteca, alcançadas pelo único caminho que existe: o nó que as aponta. */
const questionsOf = (workspaceId: string) => ({
  node: { publication: { workspaceId } },
});

const SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  updatedAt: true,
  _count: { select: { publications: true } },
} as const;

interface Row {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  updatedAt: Date;
  _count: { publications: number };
}

const toSummary = (row: Row): LibrarySummary => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  description: row.description,
  publicationCount: row._count.publications,
  updatedAt: row.updatedAt,
});

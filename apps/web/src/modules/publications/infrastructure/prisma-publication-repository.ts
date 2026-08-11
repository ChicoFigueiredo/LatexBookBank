import "server-only";

import type {
  PublicationDetail,
  PublicationRepository,
  PublicationSummary,
  PublicationWrite,
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
      select: SUMMARY_SELECT,
    });

    return rows.map(toSummary);
  }

  async listByWorkspaceId(workspaceId: string): Promise<readonly PublicationSummary[]> {
    const rows = await prisma.publication.findMany({
      where: { workspaceId },
      orderBy: { title: "asc" },
      select: SUMMARY_SELECT,
    });

    return rows.map(toSummary);
  }

  async findById(id: string): Promise<PublicationSummary | null> {
    const row = await prisma.publication.findUnique({ where: { id }, select: SUMMARY_SELECT });

    return row ? toSummary(row) : null;
  }

  async findDetailById(id: string): Promise<PublicationDetail | null> {
    const row = await prisma.publication.findUnique({ where: { id }, select: DETAIL_SELECT });
    return row ? toDetail(row, await countQuestions(id)) : null;
  }

  /**
   * Cria a publicação e liga os autores na mesma transação.
   *
   * Autor é entidade compartilhada (`Author.name` é único): dois livros do mesmo autor apontam
   * para a mesma linha, e é isso que faz "todos os livros de Iezzi" ser uma consulta em vez de
   * uma busca por texto. `connectOrCreate` resolve as duas metades sem um SELECT por autor.
   */
  async create(workspaceId: string, write: PublicationWrite): Promise<PublicationDetail> {
    const row = await prisma.publication.create({
      data: {
        workspaceId,
        ...columns(write),
        authors: {
          create: write.authors.map((name, position) => ({
            position,
            author: { connectOrCreate: { where: { name }, create: { name } } },
          })),
        },
      },
      select: DETAIL_SELECT,
    });

    // Recém-criada não tem árvore: contar seria uma consulta cuja resposta já se sabe.
    return toDetail(row, 0);
  }

  /**
   * Atualiza, e refaz a lista de autores por inteiro.
   *
   * Refazer e não diferenciar: a ordem é dado (`position`), então um autor movido do terceiro para
   * o primeiro lugar mudaria a linha de qualquer forma. Calcular o diff daria as mesmas escritas
   * com mais código para errar — e a operação toda cabe numa transação.
   */
  async update(id: string, write: PublicationWrite): Promise<PublicationDetail | null> {
    const exists = await prisma.publication.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return null;

    const [, , row] = await prisma.$transaction([
      prisma.publicationAuthor.deleteMany({ where: { publicationId: id } }),
      prisma.publication.update({ where: { id }, data: columns(write) }),
      // O `create` aninhado precisa vir depois do `deleteMany`, e a leitura depois de tudo —
      // `$transaction` com array executa na ordem declarada.
      prisma.publication.update({
        where: { id },
        data: {
          authors: {
            create: write.authors.map((name, position) => ({
              position,
              author: { connectOrCreate: { where: { name }, create: { name } } },
            })),
          },
        },
        select: DETAIL_SELECT,
      }),
    ]);

    return toDetail(row, await countQuestions(id));
  }
}

/**
 * Quantas questões vivas a publicação tem.
 *
 * `deletedAt: null` porque a lixeira não conta: um livro que mostra "40 questões" e abre com 12 na
 * árvore está mentindo sobre o acervo. Consulta separada, e não `_count` filtrado, porque contagem
 * de relação com filtro depende de flag de preview do Prisma — e uma flag é o tipo de dependência
 * que quebra numa atualização menor.
 */
async function countQuestions(publicationId: string): Promise<number> {
  return prisma.documentNode.count({
    where: { publicationId, deletedAt: null, questionId: { not: null } },
  });
}

/** As colunas escalares, iguais em criação e atualização. */
const columns = (write: PublicationWrite) => ({
  title: write.title,
  subtitle: write.subtitle,
  nickname: write.nickname,
  publisher: write.publisher,
  edition: write.edition,
  editionYear: write.editionYear,
  isbn: write.isbn,
  language: write.language,
  series: write.series,
  volume: write.volume,
  notes: write.notes,
});

const SUMMARY_SELECT = {
  id: true,
  workspaceId: true,
  title: true,
  nickname: true,
  publisher: true,
  _count: { select: { nodes: true } },
} as const;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  subtitle: true,
  edition: true,
  editionYear: true,
  isbn: true,
  language: true,
  series: true,
  volume: true,
  notes: true,
  coverAssetId: true,
  sourcePdfAssetId: true,
  updatedAt: true,
  authors: {
    orderBy: { position: "asc" },
    select: { author: { select: { name: true } } },
  },
} as const;

interface PublicationRow {
  id: string;
  workspaceId: string;
  title: string;
  nickname: string | null;
  publisher: string | null;
  _count: { nodes: number };
}

interface PublicationDetailRow extends PublicationRow {
  subtitle: string | null;
  edition: string | null;
  editionYear: number | null;
  isbn: string | null;
  language: string | null;
  series: string | null;
  volume: string | null;
  notes: string | null;
  coverAssetId: string | null;
  sourcePdfAssetId: string | null;
  updatedAt: Date;
  authors: { author: { name: string } }[];
}

const toSummary = (row: PublicationRow): PublicationSummary => ({
  id: row.id,
  workspaceId: row.workspaceId,
  title: row.title,
  nickname: row.nickname,
  publisher: row.publisher,
  nodeCount: row._count.nodes,
});

const toDetail = (row: PublicationDetailRow, questionCount: number): PublicationDetail => ({
  ...toSummary(row),
  subtitle: row.subtitle,
  authors: row.authors.map((link) => link.author.name),
  edition: row.edition,
  editionYear: row.editionYear,
  isbn: row.isbn,
  language: row.language,
  series: row.series,
  volume: row.volume,
  notes: row.notes,
  coverAssetId: row.coverAssetId,
  sourcePdfAssetId: row.sourcePdfAssetId,
  // Não vem de `_count`: `nodes` conta capítulos junto, e o número que interessa na tela do livro
  // é quantas **questões** existem. Ver `countQuestions`.
  questionCount,
  updatedAt: row.updatedAt,
});

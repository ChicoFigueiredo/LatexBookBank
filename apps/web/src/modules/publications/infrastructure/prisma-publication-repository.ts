import "server-only";

import type {
  PublicationDetail,
  PublicationRepository,
  PublicationSummary,
  PublicationWrite,
  PublicationContents,
} from "@modules/publications/domain/publication-repository";
import { PublicationInAssessmentsError } from "@modules/publications/domain/publication-draft";
import { prisma } from "@infrastructure/database/sqlite/client";
import { inChunks } from "@infrastructure/database/sqlite/in-chunks";
import { asStorageKey, type StorageKey } from "@/shared/ports";

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

  /**
   * O que a exclusão levaria junto.
   *
   * Quatro contagens numa transação de leitura: o diálogo precisa de números de verdade, e “um
   * livro” ao lado de 148 questões perdidas é um aviso que mente por omissão. Os recortes contam
   * separado porque são a **evidência** — D29 os trata como fonte, e perdê-los é diferente de
   * perder texto que dá para redigitar.
   */
  async contentsOf(id: string): Promise<PublicationContents | null> {
    const existe = await prisma.publication.findUnique({ where: { id }, select: { id: true } });
    if (existe === null) return null;

    const [questionCount, nodeCount, assetCount, anchorCount, assessments] = await Promise.all([
      prisma.documentNode.count({ where: { publicationId: id, questionId: { not: null } } }),
      prisma.documentNode.count({ where: { publicationId: id } }),
      prisma.asset.count({ where: { publicationId: id } }),
      prisma.sourceAnchor.count({ where: { publicationId: id } }),
      assessmentsUsing(prisma, id),
    ]);

    return { questionCount, nodeCount, assetCount, anchorCount, assessments };
  }

  /**
   * Apaga o livro e o que é dele, e devolve as chaves de storage que ficaram sem dono.
   *
   * As questões saem **explicitamente**: `DocumentNode` cascateia da publicação, mas `Question`
   * não — é a mesma armadilha que a lixeira global encontrou (achado 7), e deixá-la aqui
   * significaria 148 questões vivas e invisíveis a cada livro excluído.
   *
   * Ordem: nós primeiro (eles referenciam a questão), questões depois.
   *
   * Os assets (#243): o storage deduplica o arquivo pela chave, então outro livro pode ter uma
   * linha com a mesma chave — e, nas linhas gravadas antes da #254, que deduplicava a linha, a
   * linha deste livro pode ser a que outro livro usa como PDF fonte, capa ou fonte de âncora. A
   * linha só sai quando ninguém mais a cita; o arquivo só sai quando nenhuma linha resta com a
   * chave dele.
   */
  async delete(id: string): Promise<readonly StorageKey[] | null> {
    const questionIds = (
      await prisma.documentNode.findMany({
        where: { publicationId: id, questionId: { not: null } },
        select: { questionId: true },
      })
    )
      .map((node) => node.questionId)
      .filter((questionId): questionId is string => questionId !== null);

    return prisma.$transaction(async (tx) => {
      // A regra mora no caso de uso; esta é a rede para a prova montada entre a conferência e a
      // exclusão. Sem ela, a FK `RESTRICT` abortaria a transação com um 500 sem explicação.
      const assessments = await assessmentsUsing(tx, id);
      if (assessments.length > 0) throw new PublicationInAssessmentsError(assessments);

      const assets = await tx.asset.findMany({
        where: { publicationId: id },
        select: { id: true, storageKey: true },
      });

      const removida = await tx.publication.deleteMany({ where: { id } });
      if (removida.count === 0) return null;

      // Tudo em pedaços (`in-chunks.ts`): um livro inteiro tem mais questões e recortes do que o
      // SQLite aceita numa lista só.
      for (const ids of inChunks(questionIds))
        await tx.question.deleteMany({ where: { id: { in: ids } } });

      // Depois das duas exclusões, `publicationId` e `questionId` dos assets deste livro viraram
      // nulos (SetNull), e as âncoras e varreduras dele saíram em cascata: o que ainda aponta para
      // uma destas linhas é de outro livro. As capas e os PDFs fonte são colunas soltas, sem FK —
      // por isso a consulta à parte.
      const keep = new Set<string | null>();
      for (const ids of inChunks(assets.map((asset) => asset.id))) {
        const inUsePublications = await tx.publication.findMany({
          where: { OR: [{ sourcePdfAssetId: { in: ids } }, { coverAssetId: { in: ids } }] },
          select: { sourcePdfAssetId: true, coverAssetId: true },
        });
        for (const publication of inUsePublications) {
          keep.add(publication.sourcePdfAssetId);
          keep.add(publication.coverAssetId);
        }
      }

      for (const ids of inChunks(
        assets.map((asset) => asset.id).filter((assetId) => !keep.has(assetId)),
      )) {
        await tx.asset.deleteMany({
          where: {
            id: { in: ids },
            publicationId: null,
            questionId: null,
            renderJobId: null,
            anchorsAsSource: { none: {} },
            anchorsAsCrop: { none: {} },
            scanRuns: { none: {} },
          },
        });
      }

      const keys = [...new Set(assets.map((asset) => asset.storageKey))];
      const stillCited = new Set<string>();
      for (const chunk of inChunks(keys)) {
        const cited = await tx.asset.findMany({
          where: { storageKey: { in: chunk } },
          select: { storageKey: true },
        });
        for (const asset of cited) stillCited.add(asset.storageKey);
      }

      return keys.filter((key) => !stillCited.has(key)).map(asStorageKey);
    });
  }
}

type Client = Pick<typeof prisma, "assessment">;

/**
 * Os títulos das avaliações que usam alguma questão do livro — viva ou na lixeira, porque a
 * exclusão leva as duas.
 */
async function assessmentsUsing(client: Client, publicationId: string): Promise<string[]> {
  const rows = await client.assessment.findMany({
    where: {
      sections: {
        some: { items: { some: { question: { node: { publicationId } } } } },
      },
    },
    select: { title: true },
    orderBy: { title: "asc" },
  });

  return rows.map((row) => row.title);
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

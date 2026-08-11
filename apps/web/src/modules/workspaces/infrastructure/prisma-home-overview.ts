import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";

/**
 * O que a Home mostra para quem já tem acervo.
 *
 * A prioridade é a do design (ajustes finais §19): **continuar trabalhando** vem antes de tudo.
 * Uma Home que abre com um dashboard obriga a lembrar onde se parou; esta responde antes de ser
 * perguntada.
 *
 * Uma leitura só, aqui na infraestrutura, porque é um **read model**: nenhuma regra de negócio
 * decide o que entra: é projeção para uma tela. Espalhar isso por três repositórios daria três
 * consultas e a mesma resposta.
 */

export interface ContinueWhere {
  readonly questionId: string;
  readonly nodeId: string;
  readonly publicationId: string;
  readonly publicationTitle: string;
  readonly libraryName: string;
  /** "Capítulo 1 › Exercícios › Questão 27" — o caminho, não só o nó. */
  readonly path: string;
  readonly updatedAt: Date;
}

export interface RecentPublication {
  readonly id: string;
  readonly title: string;
  readonly libraryName: string;
  readonly librarySlug: string;
  readonly questionCount: number;
  readonly updatedAt: Date;
}

export interface HomeOverview {
  readonly continueWhere: ContinueWhere | null;
  readonly recent: readonly RecentPublication[];
  /** Questões que a validação reprovou — o que impede a prova de sair. */
  readonly invalidCount: number;
}

export async function readHomeOverview(): Promise<HomeOverview> {
  const [lastNode, recentRows, invalidCount] = await Promise.all([
    prisma.documentNode.findFirst({
      where: { deletedAt: null, questionId: { not: null } },
      orderBy: { question: { updatedAt: "desc" } },
      select: {
        id: true,
        title: true,
        parentId: true,
        publicationId: true,
        publication: { select: { title: true, workspace: { select: { name: true } } } },
        question: { select: { id: true, updatedAt: true, nickname: true } },
      },
    }),
    prisma.publication.findMany({
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        id: true,
        title: true,
        updatedAt: true,
        workspace: { select: { name: true, slug: true } },
      },
    }),
    prisma.question.count({ where: { validationStatus: "INVALID" } }),
  ]);

  const questionCounts = await countQuestionsByPublication(recentRows.map((row) => row.id));

  return {
    continueWhere: lastNode?.question
      ? {
          questionId: lastNode.question.id,
          nodeId: lastNode.id,
          publicationId: lastNode.publicationId,
          publicationTitle: lastNode.publication.title,
          libraryName: lastNode.publication.workspace.name,
          path: await pathOf(lastNode.parentId, lastNode.title ?? lastNode.question.nickname ?? "Questão"),
          updatedAt: lastNode.question.updatedAt,
        }
      : null,
    recent: recentRows.map((row) => ({
      id: row.id,
      title: row.title,
      libraryName: row.workspace.name,
      librarySlug: row.workspace.slug,
      questionCount: questionCounts.get(row.id) ?? 0,
      updatedAt: row.updatedAt,
    })),
    invalidCount,
  };
}

/**
 * Quantas questões vivas cada publicação tem, numa consulta só.
 *
 * `groupBy` e não uma contagem por livro: seis consultas para desenhar seis linhas é o tipo de
 * N+1 que não dói com seis e dói com sessenta.
 */
async function countQuestionsByPublication(ids: readonly string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();

  const groups = await prisma.documentNode.groupBy({
    by: ["publicationId"],
    where: { publicationId: { in: [...ids] }, deletedAt: null, questionId: { not: null } },
    _count: { _all: true },
  });

  return new Map(groups.map((group) => [group.publicationId, group._count._all]));
}

/**
 * Sobe a árvore montando o caminho legível.
 *
 * Profundidade limitada de propósito: um livro tem parte › capítulo › seção › grupo, e cinco
 * níveis já é mais do que qualquer sumário real. O teto também é o que impede um ciclo — que a
 * árvore proíbe, mas que uma linha corrompida poderia introduzir — de virar laço infinito numa
 * consulta de tela inicial.
 */
async function pathOf(parentId: string | null, leaf: string): Promise<string> {
  const parts: string[] = [leaf];

  let current = parentId;
  for (let depth = 0; depth < 5 && current !== null; depth++) {
    const node: { title: string | null; parentId: string | null } | null =
      await prisma.documentNode.findUnique({
        where: { id: current },
        select: { title: true, parentId: true },
      });
    if (!node) break;

    if (node.title) parts.unshift(node.title);
    current = node.parentId;
  }

  return parts.join(" › ");
}

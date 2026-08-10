import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import type { TagRecord, TagRepository } from "@modules/questions/application/tag-question";
import type { TagSuggestion } from "@modules/questions/domain/tag";

/**
 * Persistência de tags.
 *
 * Nenhuma regra aqui: quem decide que "funcao quadratica" e "Função Quadrática" são a mesma coisa
 * é `tagKey`, no domínio, e quem decide reaproveitar em vez de criar é `tagQuestion`. Este
 * arquivo lê e grava.
 *
 * A **chave de comparação não é gravada**. Poderia ser — uma coluna `key` com `@unique` faria o
 * banco recusar a duplicata —, mas ela mudaria de valor se a regra de normalização mudasse, e
 * teríamos uma coluna que só está certa enquanto ninguém mexe na função que a produz. O que o
 * banco garante é `[workspaceId, name]` único; a duplicata por grafia é decidida antes de chegar
 * aqui, com a lista em mãos.
 *
 * Ver spec §33 · issue #141.
 */
export class PrismaTagRepository implements TagRepository {
  async listTags(workspaceId: string): Promise<readonly TagSuggestion[]> {
    const rows = await prisma.tag.findMany({
      where: { workspaceId },
      select: { id: true, name: true, _count: { select: { questions: true } } },
    });

    // A ordenação por uso é do domínio (`rankSuggestions`) — aqui só sai a contagem. Ordenar nos
    // dois lugares daria duas respostas para "qual é a ordem", e uma delas ficaria para trás.
    return rows.map((row) => ({ id: row.id, name: row.name, usageCount: row._count.questions }));
  }

  async createTag(workspaceId: string, name: string): Promise<TagRecord> {
    return prisma.tag.create({
      data: { workspaceId, name },
      select: { id: true, name: true },
    });
  }

  async attach(questionId: string, tagId: string): Promise<void> {
    // Marcar de novo o que já está marcado é clique duplo, não erro — e o par é chave primária,
    // então `create` daria violação de constraint por um gesto normal.
    await prisma.questionTag.upsert({
      where: { questionId_tagId: { questionId, tagId } },
      create: { questionId, tagId },
      update: {},
    });
  }

  async detach(questionId: string, tagId: string): Promise<void> {
    await prisma.questionTag.deleteMany({ where: { questionId, tagId } });
  }

  async listQuestionTags(questionId: string): Promise<readonly TagRecord[]> {
    const rows = await prisma.questionTag.findMany({
      where: { questionId },
      select: { tag: { select: { id: true, name: true } } },
      orderBy: { tag: { name: "asc" } },
    });

    return rows.map((row) => row.tag);
  }
}

/** O workspace dono da questão. A tag é por workspace, e o cliente não escolhe qual. */
export async function workspaceOfQuestion(questionId: string): Promise<string | null> {
  const row = await prisma.question.findUnique({
    where: { id: questionId },
    select: { node: { select: { publication: { select: { workspaceId: true } } } } },
  });

  return row?.node?.publication.workspaceId ?? null;
}

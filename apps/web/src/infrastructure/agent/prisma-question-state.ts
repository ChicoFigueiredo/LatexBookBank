import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import type { QuestionState } from "@modules/agents/domain/patch-diff";

/**
 * O estado da questão para calcular o diff — **fora** de transação.
 *
 * Existe separado do aplicador porque serve a outro momento: aqui o diff é só para mostrar, e
 * mostrar não precisa de bloqueio. Quando o usuário aprovar, o estado é lido outra vez, dentro da
 * transação, e o diff é recalculado — é lá que a concorrência importa.
 *
 * Ver spec §35 · issue #103.
 */
export async function readQuestionState(questionId: string): Promise<QuestionState | null> {
  const row = await prisma.question.findUnique({
    where: { id: questionId },
    select: {
      statementLatex: true,
      solutionLatex: true,
      complementLatex: true,
      nickname: true,
      difficulty: true,
      year: true,
      board: true,
      institution: true,
      role: true,
      roleLevel: true,
      publisher: true,
      videoUrl: true,
      options: {
        orderBy: { sortKey: "asc" },
        select: { id: true, statementLatex: true, isCorrect: true },
      },
      tags: { select: { tag: { select: { name: true } } } },
    },
  });
  if (!row) return null;

  const { options, tags, statementLatex, solutionLatex, complementLatex, nickname, ...metadata } =
    row;

  return {
    statementLatex,
    solutionLatex,
    complementLatex,
    nickname,
    options,
    metadata,
    tags: tags.map((link) => link.tag.name),
  };
}

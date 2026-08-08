import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import type { QuestionForRender } from "@modules/rendering/domain/build-render-bundle";

/**
 * A questão e o workspace a que ela pertence.
 *
 * O `workspaceId` não está na questão: ele vem do nó da árvore → publicação → workspace. Subir a
 * cadeia aqui é o que permite ao caso de uso receber o workspace pronto — e o workspace importa
 * porque é o prefixo do storage e o escopo do cache.
 */
export interface QuestionRenderSource {
  readonly workspaceId: string;
  readonly question: QuestionForRender;
}

export async function loadQuestionForRender(
  questionId: string,
): Promise<QuestionRenderSource | null> {
  const row = await prisma.question.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      statementLatex: true,
      solutionLatex: true,
      complementLatex: true,
      options: {
        // A ordem é a do `sortKey`, e é ela que decide a letra da alternativa (D9). Sem o
        // `orderBy`, o banco devolve na ordem que quiser e o gabarito passa a apontar para outra.
        orderBy: { sortKey: "asc" },
        select: { statementLatex: true, isCorrect: true },
      },
      node: { select: { publication: { select: { workspaceId: true } } } },
    },
  });

  if (row === null || row.node === null) return null;

  return {
    workspaceId: row.node.publication.workspaceId,
    question: {
      id: row.id,
      statementLatex: row.statementLatex,
      solutionLatex: row.solutionLatex,
      complementLatex: row.complementLatex,
      options: row.options,
    },
  };
}

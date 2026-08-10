import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import type { ValidationWriter } from "@modules/questions/application/validate-question";
import type { QuestionForPlugin } from "@modules/questions/domain/question-type-plugin";
import { isQuestionType, type ValidationStatus } from "@modules/questions/domain/question-type";

/**
 * Grava o resultado da validação, e lê o que ela precisa avaliar.
 *
 * Existe porque o estado **não tinha produtor**: `validateAndPersist` estava escrito e testado
 * desde a Fase 7 e nunca era chamado, então as 16 questões do banco estavam `UNVALIDATED` e o
 * indicador da árvore nunca acenderia. Regra sem produtor é regra que não vale.
 *
 * Ver spec §4.1 · issue #147.
 */
export class PrismaValidationWriter implements ValidationWriter {
  async setValidationStatus(questionId: string, status: ValidationStatus): Promise<void> {
    // `updateMany` e não `update`: a questão pode ter sido apagada entre o salvamento e a
    // validação, e derrubar o salvamento por causa disso seria trocar um dado bom por um erro.
    await prisma.question.updateMany({
      where: { id: questionId },
      data: { validationStatus: status },
    });
  }
}

/** O agregado como o plugin quer ver. `null` quando a questão sumiu ou tem tipo desconhecido. */
export async function questionForValidation(questionId: string): Promise<QuestionForPlugin | null> {
  const row = await prisma.question.findUnique({
    where: { id: questionId },
    select: {
      type: true,
      statementLatex: true,
      solutionLatex: true,
      complementLatex: true,
      options: {
        orderBy: { sortKey: "asc" },
        select: { id: true, statementLatex: true, isCorrect: true },
      },
    },
  });

  // Tipo fora do vocabulário vira `null`, e o caso de uso trata como "não sei avaliar" —
  // `UNVALIDATED`, não `INVALID`. Dizer que a questão está errada seria mentira: o que falta é
  // o produto saber avaliá-la.
  if (row === null || !isQuestionType(row.type)) return null;

  return {
    type: row.type,
    statementLatex: row.statementLatex,
    solutionLatex: row.solutionLatex,
    complementLatex: row.complementLatex,
    options: row.options,
  };
}

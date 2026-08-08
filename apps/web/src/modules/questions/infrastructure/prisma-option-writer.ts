import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import type { OptionWriter } from "@modules/questions/application/mutate-options";
import type { OptionRecord } from "@modules/questions/domain/option-mutations";
import { isQuestionType, type QuestionType } from "@modules/questions/domain/question-type";

/**
 * Escrita de alternativas.
 *
 * Nenhuma regra aqui: as decisões — que chave usar, quem desmarcar, o que pode ser removido —
 * já vieram do domínio. Este arquivo lê, grava e nada mais.
 */

const SELECT = {
  id: true,
  sortKey: true,
  statementLatex: true,
  solutionLatex: true,
  isCorrect: true,
} as const;

export class PrismaOptionWriter implements OptionWriter {
  async listOptions(questionId: string): Promise<readonly OptionRecord[]> {
    return prisma.questionOption.findMany({
      where: { questionId },
      // `sortKey` e não `createdAt`: a ordem é a que a pessoa definiu arrastando, e o banco não
      // garante ordem nenhuma sem `ORDER BY`.
      orderBy: { sortKey: "asc" },
      select: SELECT,
    });
  }

  async questionType(questionId: string): Promise<QuestionType | null> {
    const row = await prisma.question.findUnique({
      where: { id: questionId },
      select: { type: true },
    });

    // O tipo é `String` no banco (o conector SQLite não tem `enum`), então a fronteira valida.
    // Tipo desconhecido vira `null` e o caso de uso responde "questão não existe" — que é
    // impreciso, mas melhor do que seguir tratando lixo como se fosse vocabulário.
    return row !== null && isQuestionType(row.type) ? row.type : null;
  }

  async insertOption(questionId: string, option: Omit<OptionRecord, "id">): Promise<OptionRecord> {
    return prisma.questionOption.create({
      data: { questionId, ...option },
      select: SELECT,
    });
  }

  async deleteOption(questionId: string, optionId: string): Promise<void> {
    // `deleteMany` com os dois ids: `delete` por id sozinho apagaria uma alternativa de **outra**
    // questão se alguém montasse a requisição à mão. Aqui o par tem de bater.
    await prisma.questionOption.deleteMany({ where: { id: optionId, questionId } });
  }

  async applyPatches(
    questionId: string,
    patches: readonly { id: string; sortKey?: string; isCorrect?: boolean }[],
  ): Promise<void> {
    if (patches.length === 0) return;

    // Transação: marcar uma correta desmarca a outra, e meio patch aplicado deixaria **duas**
    // corretas — exatamente o estado que a validação chama de erro.
    await prisma.$transaction(
      patches.map((patch) =>
        prisma.questionOption.updateMany({
          where: { id: patch.id, questionId },
          data: {
            ...(patch.sortKey === undefined ? {} : { sortKey: patch.sortKey }),
            ...(patch.isCorrect === undefined ? {} : { isCorrect: patch.isCorrect }),
          },
        }),
      ),
    );
  }

  /** Edita o texto. Fora do `OptionWriter` porque não é mutação de estrutura. */
  async updateText(questionId: string, optionId: string, statementLatex: string): Promise<void> {
    await prisma.questionOption.updateMany({
      where: { id: optionId, questionId },
      data: { statementLatex },
    });
  }
}

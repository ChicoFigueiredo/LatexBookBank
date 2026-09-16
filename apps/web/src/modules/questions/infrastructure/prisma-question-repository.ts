import "server-only";

import type {
  QuestionEdit,
  QuestionRepository,
  QuestionSnapshot,
} from "@modules/questions/domain/question-repository";
import { prisma } from "@infrastructure/database/sqlite/client";
import {
  isQuestionType,
  QUESTION_STATUSES,
  type QuestionStatus,
} from "@modules/questions/domain/question-type";

const SELECT = {
  id: true,
  type: true,
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
  status: true,
  updatedAt: true,
} as const;

export class PrismaQuestionRepository implements QuestionRepository {
  async findById(questionId: string): Promise<QuestionSnapshot | null> {
    const row = await prisma.question.findUnique({ where: { id: questionId }, select: SELECT });
    if (row === null) return null;

    // O banco guarda `String` porque o conector SQLite não tem `enum`. Linha com tipo
    // desconhecido cai em discursiva — a mesma escolha que a busca faz, e pelo mesmo motivo: uma
    // questão que some é pior que uma exibida com o rótulo errado.
    return {
      ...row,
      type: isQuestionType(row.type) ? row.type : "DISCURSIVE",
      status: (QUESTION_STATUSES as readonly string[]).includes(row.status)
        ? (row.status as QuestionStatus)
        : "DRAFT",
    };
  }

  /**
   * `updateMany` com `updatedAt` no `where` — não `update`.
   *
   * É a diferença entre concorrência otimista de verdade e uma checagem decorativa. `update`
   * localiza pela chave primária e grava; a comparação teria de acontecer antes, em código, e
   * entre a leitura e a escrita cabe outra transação. Com `updateMany`, a condição vai **na
   * cláusula**: o banco grava zero linhas se a versão mudou, e `count` conta a história.
   *
   * O custo é não receber a linha de volta — daí a leitura depois. Ela é segura porque, se
   * chegou aqui, esta transação foi a que gravou.
   */
  async updateIfUnchanged(
    questionId: string,
    expectedUpdatedAt: Date,
    edit: QuestionEdit,
  ): Promise<QuestionSnapshot | null> {
    const data = Object.fromEntries(
      Object.entries(edit).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(data).length === 0) return this.findById(questionId);

    const result = await prisma.question.updateMany({
      where: { id: questionId, updatedAt: expectedUpdatedAt },
      data,
    });

    if (result.count === 0) return null;
    return this.findById(questionId);
  }
}

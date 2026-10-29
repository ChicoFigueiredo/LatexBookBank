import type { Prisma } from "@/generated/prisma/client";

/**
 * A linha de `Question`, as alternativas e as tags — **o único lugar que cria questão** (ARQ-01).
 *
 * Antes, cinco adaptadores criavam a questão cada um do seu jeito: a criação manual, a aprovação
 * do scan, duplicar nó, o `.lbb` e o import legado. Uma coluna nova, ou uma regra de criação, tinha
 * de ser lembrada em cinco transações, e a esquecida gravava questões diferentes conforme o caminho
 * de entrada. Quem cria questão agora passa por aqui, quase sempre pelo escritor de nó
 * (`insertNode`), que a pendura no nó e grava as âncoras.
 *
 * Sem `server-only` e sem o cliente do módulo: o importador legado roda pela linha de comando, com
 * o cliente dele, e chega aqui com a transação aberta.
 */

type Tx = Prisma.TransactionClient;

/**
 * As colunas que quem cria escolhe. O que fica de fora é decidido aqui: `id` e datas são do banco,
 * e a origem (`sourceAnchorId`) é das âncoras do nó — quem a grava é `writeNodeAnchors`, para a
 * coluna nunca discordar da lista.
 */
export type NewQuestionColumns = Pick<
  Prisma.QuestionUncheckedCreateInput,
  | "type"
  | "nickname"
  | "statementLatex"
  | "solutionLatex"
  | "complementLatex"
  | "originalLatex"
  | "difficulty"
  | "year"
  | "board"
  | "institution"
  | "role"
  | "roleLevel"
  | "publisher"
  | "videoUrl"
  | "status"
  | "validationStatus"
  | "legacyId"
>;

export type NewQuestionOption = Pick<
  Prisma.QuestionOptionUncheckedCreateInput,
  | "sortKey"
  | "statementLatex"
  | "solutionLatex"
  | "originalLatex"
  | "isCorrect"
  | "weight"
  | "legacyId"
  | "legacyMarcacao"
>;

export interface QuestionToInsert {
  readonly columns: NewQuestionColumns;
  /** Na ordem de leitura; o `sortKey` de cada uma já vem decidido. */
  readonly options: readonly NewQuestionOption[];
  readonly tagIds?: readonly string[];
}

export interface InsertedQuestion {
  readonly questionId: string;
  /** Na ordem de `options`: o `.lbb` traduz o id de origem de cada alternativa por aqui. */
  readonly optionIds: readonly string[];
}

export async function insertQuestion(
  tx: Tx,
  question: QuestionToInsert,
): Promise<InsertedQuestion> {
  const created = await tx.question.create({
    data: { ...question.columns },
    select: { id: true },
  });

  // Uma a uma, e não no `create` aninhado: o aninhado não devolve os ids, e o `.lbb` precisa
  // deles para o gabarito das avaliações e o histórico apontarem para as alternativas deste banco.
  const optionIds: string[] = [];
  for (const option of question.options) {
    const row = await tx.questionOption.create({
      data: { ...option, questionId: created.id },
      select: { id: true },
    });
    optionIds.push(row.id);
  }

  for (const tagId of question.tagIds ?? []) {
    await tx.questionTag.create({ data: { questionId: created.id, tagId } });
  }

  return { questionId: created.id, optionIds };
}

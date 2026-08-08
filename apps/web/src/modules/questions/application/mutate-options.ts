import {
  keyForMove,
  keyForNewOption,
  patchesForCorrect,
  OptionNotFoundError,
  type OptionRecord,
} from "../domain/option-mutations";
import type { QuestionType } from "../domain/question-type";

/**
 * As mutações de alternativa, com o banco no meio.
 *
 * A regra continua no domínio; aqui só se lê, se decide qual função chamar e se grava. Nenhum
 * `if` de negócio — o único condicional que sobra é "qual tipo permite mais de uma correta", e
 * ele vem da tabela abaixo, não de um `switch` espalhado.
 */

/**
 * Tipos em que **só uma** alternativa pode ser correta.
 *
 * Tabela, e não `switch`: acrescentar um tipo é acrescentar uma linha, e o guard da #79 continua
 * valendo. `TRUE_FALSE` entra porque cada item é verdadeiro **ou** falso; `MULTIPLE_CORRECT` e
 * `SUM_OF_CORRECT` ficam de fora porque a natureza deles é ter várias.
 */
const EXCLUSIVE_CORRECT: Readonly<Record<QuestionType, boolean>> = {
  DISCURSIVE: true,
  MULTIPLE_CHOICE: true,
  TRUE_FALSE: true,
  CESPE: true,
  MULTIPLE_CORRECT: false,
  SUM_OF_CORRECT: false,
  RELATED_ITEMS: false,
};

export const isExclusiveCorrect = (type: QuestionType): boolean => EXCLUSIVE_CORRECT[type];

export interface OptionWriter {
  listOptions(questionId: string): Promise<readonly OptionRecord[]>;
  questionType(questionId: string): Promise<QuestionType | null>;
  insertOption(questionId: string, option: Omit<OptionRecord, "id">): Promise<OptionRecord>;
  deleteOption(questionId: string, optionId: string): Promise<void>;
  /** Aplica os patches numa transação — meio patch aplicado deixaria duas corretas. */
  applyPatches(
    questionId: string,
    patches: readonly { id: string; sortKey?: string; isCorrect?: boolean }[],
  ): Promise<void>;
}

export class QuestionNotFoundError extends Error {
  constructor(readonly questionId: string) {
    super(`Questão ${questionId} não existe.`);
    this.name = "QuestionNotFoundError";
  }
}

export async function addOption(
  writer: OptionWriter,
  questionId: string,
  statementLatex = "",
): Promise<OptionRecord> {
  const options = await writer.listOptions(questionId);

  return writer.insertOption(questionId, {
    sortKey: keyForNewOption(options),
    statementLatex,
    solutionLatex: "",
    // Nunca correta ao nascer: uma alternativa em branco marcada como gabarito é o tipo de coisa
    // que passa despercebida até alguém imprimir a prova.
    isCorrect: false,
  });
}

/**
 * Remove.
 *
 * Remover a **única** correta é permitido, e de propósito: quem está reescrevendo a questão
 * precisa poder tirar a alternativa antes de pôr a nova. O que impede a questão de ficar assim é
 * a validação (#79), que acusa "nenhuma alternativa marcada como correta" — recusar aqui
 * transformaria uma edição normal numa dança de ordem obrigatória.
 */
export async function removeOption(
  writer: OptionWriter,
  questionId: string,
  optionId: string,
): Promise<void> {
  const options = await writer.listOptions(questionId);
  if (!options.some((option) => option.id === optionId)) throw new OptionNotFoundError(optionId);

  await writer.deleteOption(questionId, optionId);
}

export async function moveOption(
  writer: OptionWriter,
  questionId: string,
  optionId: string,
  targetIndex: number,
): Promise<void> {
  const options = await writer.listOptions(questionId);
  await writer.applyPatches(questionId, [
    { id: optionId, sortKey: keyForMove(options, optionId, targetIndex) },
  ]);
}

export async function setCorrectOption(
  writer: OptionWriter,
  questionId: string,
  optionId: string,
): Promise<void> {
  const type = await writer.questionType(questionId);
  if (type === null) throw new QuestionNotFoundError(questionId);

  const options = await writer.listOptions(questionId);
  const patches = patchesForCorrect(options, optionId, isExclusiveCorrect(type));

  // Lista vazia é resultado legítimo — clicar de novo na correta em tipo exclusivo não faz nada.
  // Chamar o banco com zero patches seria uma transação para não mudar coisa alguma.
  if (patches.length > 0) await writer.applyPatches(questionId, patches);
}

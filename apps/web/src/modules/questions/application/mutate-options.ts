import {
  isExclusiveCorrect,
  keyForMove,
  keyForNewOption,
  parseOptionEdit,
  patchesForCorrect,
  OptionNotFoundError,
  type OptionPatch,
  type OptionRecord,
} from "../domain/option-mutations";
import type { QuestionType } from "../domain/question-type";
import { afterQuestionChanged, type QuestionValidation } from "./validate-question";

/**
 * As mutações de alternativa, com o banco no meio.
 *
 * A regra continua no domínio; aqui só se lê, se decide qual função chamar e se grava. Nenhum
 * `if` de negócio — o único condicional que sobra é "qual tipo permite mais de uma correta", e
 * quem responde é o plugin do tipo, não uma tabela daqui.
 */

/**
 * Só **uma** alternativa pode ser correta neste tipo? Quem responde é o plugin, pelo domínio — o
 * patch do agente e a restauração de revisão usam a mesma regra; aqui ela segue exportada para quem
 * já a usava.
 */
export { isExclusiveCorrect };

export interface OptionWriter {
  listOptions(questionId: string): Promise<readonly OptionRecord[]>;
  questionType(questionId: string): Promise<QuestionType | null>;
  insertOption(questionId: string, option: Omit<OptionRecord, "id">): Promise<OptionRecord>;
  deleteOption(questionId: string, optionId: string): Promise<void>;
  /**
   * Aplica os patches numa transação — meio patch aplicado deixaria duas corretas, ou moveria
   * a alternativa sem gravar o texto que veio no mesmo pedido.
   */
  applyPatches(questionId: string, patches: readonly OptionPatch[]): Promise<void>;
}

/**
 * Toda mutação de alternativa revalida a questão depois de gravar (tarefa D4 da revisão de
 * 2026-09-23): `no_correct_option`, `multiple_correct_options` e `empty_option` dependem das
 * alternativas, e o selo da árvore lê o veredito gravado.
 *
 * Parâmetro final e opcional para os testes de regra, que não têm banco; as rotas sempre passam.
 */
const revalidate = (validation: QuestionValidation | undefined, questionId: string) =>
  validation ? afterQuestionChanged(validation, questionId) : Promise.resolve();

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
  validation?: QuestionValidation,
): Promise<OptionRecord> {
  const options = await writer.listOptions(questionId);

  const created = await writer.insertOption(questionId, {
    sortKey: keyForNewOption(options),
    statementLatex,
    solutionLatex: "",
    // Nunca correta ao nascer: uma alternativa em branco marcada como gabarito é o tipo de coisa
    // que passa despercebida até alguém imprimir a prova.
    isCorrect: false,
  });
  await revalidate(validation, questionId);
  return created;
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
  validation?: QuestionValidation,
): Promise<void> {
  const options = await writer.listOptions(questionId);
  if (!options.some((option) => option.id === optionId)) throw new OptionNotFoundError(optionId);

  await writer.deleteOption(questionId, optionId);
  await revalidate(validation, questionId);
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
  validation?: QuestionValidation,
): Promise<void> {
  const type = await writer.questionType(questionId);
  if (type === null) throw new QuestionNotFoundError(questionId);

  const options = await writer.listOptions(questionId);
  const patches = patchesForCorrect(options, optionId, isExclusiveCorrect(type));

  // Lista vazia é resultado legítimo — clicar de novo na correta em tipo exclusivo não faz nada.
  // Chamar o banco com zero patches seria uma transação para não mudar coisa alguma.
  if (patches.length > 0) await writer.applyPatches(questionId, patches);
  await revalidate(validation, questionId);
}

/**
 * Edita uma alternativa: posição, gabarito e texto, num pedido só (STE-15).
 *
 * O texto passava direto da rota para o adaptador: alternativa apagada em outra aba respondia 200
 * sem gravar nada, não havia teto de tamanho, e as três mudanças saíam em escritas separadas. Aqui
 * o pedido é conferido inteiro, a alternativa tem de existir, e tudo vai numa transação do writer.
 */
export async function editOption(
  writer: OptionWriter,
  questionId: string,
  optionId: string,
  raw: {
    readonly targetIndex?: unknown;
    readonly isCorrect?: unknown;
    readonly statementLatex?: unknown;
  },
  validation?: QuestionValidation,
): Promise<void> {
  const edit = parseOptionEdit(raw);

  const options = await writer.listOptions(questionId);
  if (!options.some((option) => option.id === optionId)) throw new OptionNotFoundError(optionId);

  const patches = new Map<string, OptionPatch>();
  const merge = (patch: OptionPatch) =>
    patches.set(patch.id, { ...patches.get(patch.id), ...patch });

  if (edit.targetIndex !== undefined) {
    merge({ id: optionId, sortKey: keyForMove(options, optionId, edit.targetIndex) });
  }
  if (edit.markCorrect) {
    const type = await writer.questionType(questionId);
    if (type === null) throw new QuestionNotFoundError(questionId);
    for (const patch of patchesForCorrect(options, optionId, isExclusiveCorrect(type)))
      merge(patch);
  }
  if (edit.statementLatex !== undefined) {
    merge({ id: optionId, statementLatex: edit.statementLatex });
  }

  if (patches.size === 0) return;
  await writer.applyPatches(questionId, [...patches.values()]);
  await revalidate(validation, questionId);
}

import { rebalanceKeys } from "@modules/document-tree/domain/fractional-index";

import {
  describeChanges,
  planApply,
  snapshotOf,
  type ApplyPlan,
  type QuestionSnapshot,
} from "../domain/apply-patch";
import type { QuestionState } from "../domain/patch-diff";
import type { QuestionPatch } from "../domain/question-patch";
import {
  afterQuestionChanged,
  type QuestionValidation,
} from "@modules/questions/application/validate-question";

/**
 * Aplica o que o usuário aprovou — **numa transação, com a revisão anterior gravada antes**.
 *
 * A ordem importa e é o motivo de este arquivo existir: lê o estado, grava a revisão do estado
 * anterior, e só então escreve. Fora de uma transação, uma falha entre os dois passos deixaria a
 * mudança sem o seu "antes" — que é exatamente o momento em que a revisão importava.
 *
 * O plano é recalculado **aqui**, a partir do estado corrente, e não aceito da tela. A tela pode
 * estar mostrando um diff de trinta segundos atrás; entre a proposta e o clique, outra aba ou o
 * autosave podem ter mudado a questão. Recalcular é o que transforma "aprovei estas linhas" em
 * "estas linhas ainda existem".
 *
 * Ver spec §35 · issue #101.
 */

export interface PatchTransaction {
  /** O estado corrente, lido **dentro** da transação. */
  readStateForUpdate(questionId: string): Promise<QuestionState | null>;
  /** Grava a revisão do estado anterior e devolve o número dela. */
  writeRevision(input: {
    questionId: string;
    origin: "AGENT" | "USER";
    agentRunId: string | null;
    summary: string;
    snapshotJson: string;
  }): Promise<number>;
  applyFields(questionId: string, fields: Readonly<Record<string, string | null>>): Promise<void>;
  /**
   * Grava texto e gabarito das alternativas. Um id que não é desta questão recusa a lista
   * inteira com `AlternativaDeOutraQuestaoError`: gravar o resto deixaria um gabarito exclusivo
   * com a antiga desmarcada e a nova em lugar nenhum.
   */
  applyOptions(
    questionId: string,
    options: readonly { id: string; statementLatex?: string; isCorrect?: boolean }[],
  ): Promise<void>;
  /** Reordena as alternativas. Um id que não é desta questão recusa a lista inteira. */
  applyReorder(questionId: string, optionIds: readonly string[]): Promise<void>;
  /**
   * Deixa as alternativas **exatamente** como na lista: apaga as que não estão nela, recria com o
   * mesmo id as que faltam e grava texto, gabarito e posição de todas. É a restauração — nenhuma
   * regra de tipo se aplica, porque o estado restaurado já foi um estado válido.
   */
  restoreOptions(
    questionId: string,
    options: readonly { id: string; sortKey: string; statementLatex: string; isCorrect: boolean }[],
  ): Promise<void>;
  applyMetadata(questionId: string, metadata: Readonly<Record<string, unknown>>): Promise<void>;
  applyTags(questionId: string, names: readonly string[]): Promise<void>;
}

export interface PatchApplier {
  /** Roda tudo dentro de uma transação. Se o callback lançar, nada é gravado. */
  transact<T>(run: (tx: PatchTransaction) => Promise<T>): Promise<T>;
}

export class QuestionGoneError extends Error {
  constructor(questionId: string) {
    super(`A questão \`${questionId}\` não existe mais.`);
    this.name = "QuestionGoneError";
  }
}

/**
 * O patch citou uma alternativa que não é da questão. O plano já descarta esse id; este erro é a
 * segunda barreira, no adaptador, e lançado dentro da transação desfaz também a revisão.
 */
export class AlternativaDeOutraQuestaoError extends Error {
  constructor(questionId: string, optionIds: readonly string[]) {
    super(
      `As alternativas ${optionIds.map((id) => `\`${id}\``).join(", ")} não são da questão \`${questionId}\`.`,
    );
    this.name = "AlternativaDeOutraQuestaoError";
  }
}

export interface ApplyResult {
  readonly revisionNumber: number;
  readonly applied: readonly string[];
  /** Aprovadas que já não existiam no diff — o estado mudou desde a proposta. */
  readonly stale: readonly string[];
  readonly summary: string;
}

export interface ApplyInput {
  readonly questionId: string;
  readonly patch: QuestionPatch;
  /**
   * Os ids das linhas do diff que o usuário aprovou.
   *
   * Obrigatório, sem default. Aplicar o patch inteiro porque ele chegou é o mesmo que não ter
   * aprovação — e um default esconderia a decisão mais importante do fluxo num parâmetro
   * opcional.
   */
  readonly approvedChangeIds: readonly string[];
  readonly origin?: "AGENT" | "USER";
  readonly agentRunId?: string | null;
}

export async function applyQuestionPatch(
  applier: PatchApplier,
  input: ApplyInput,
  validation?: QuestionValidation,
): Promise<ApplyResult> {
  const result = await applier.transact(async (tx) => {
    const state = await tx.readStateForUpdate(input.questionId);
    if (state === null) throw new QuestionGoneError(input.questionId);

    // Recalculado do estado corrente. Lança quando nada aprovado sobrou.
    const plan: ApplyPlan = planApply(state, input.patch, input.approvedChangeIds);
    const summary = `${input.patch.summary} (${describeChanges(plan.changes)})`;

    // **Antes** de qualquer escrita, e na mesma transação.
    const revisionNumber = await tx.writeRevision({
      questionId: input.questionId,
      origin: input.origin ?? "AGENT",
      agentRunId: input.agentRunId ?? null,
      summary,
      snapshotJson: snapshotOf(state),
    });

    if (Object.keys(plan.fields).length > 0) {
      await tx.applyFields(input.questionId, plan.fields);
    }
    if (plan.options.length > 0) {
      await tx.applyOptions(input.questionId, plan.options);
    }
    if (plan.reorder !== null) {
      await tx.applyReorder(input.questionId, plan.reorder);
    }
    if (Object.keys(plan.metadata).length > 0) {
      await tx.applyMetadata(input.questionId, plan.metadata);
    }
    if (plan.tags !== null) {
      await tx.applyTags(input.questionId, plan.tags);
    }

    return {
      revisionNumber,
      applied: plan.changes.map((change) => change.id),
      stale: plan.stale,
      summary,
    };
  });

  // Depois da transação, e fora dela: o patch que corrige o gabarito tira a questão do vermelho
  // (tarefa D4 da revisão de 2026-09-23). Falhar aqui não desfaz o que o usuário aprovou.
  if (validation) await afterQuestionChanged(validation, input.questionId);
  return result;
}

/**
 * Desfaz, restaurando um snapshot — e **gravando uma revisão do estado atual antes**.
 *
 * Reverter é uma mudança como outra qualquer. Tratá-la como exceção — "isto é só desfazer, não
 * precisa registrar" — é como se perde a possibilidade de desfazer o desfazer, que é justamente
 * o que alguém quer quando reverteu por engano.
 */
export async function revertQuestion(
  applier: PatchApplier,
  input: { questionId: string; snapshotJson: string; summary: string },
  validation?: QuestionValidation,
): Promise<number> {
  const snapshot = JSON.parse(input.snapshotJson) as QuestionSnapshot;

  // A revisão gravada antes da versão 2 não tem a posição: a ordem dela é a da lista, e as chaves
  // são refeitas na mesma ordem. Com a posição, ela volta como era.
  const fallbackKeys = rebalanceKeys(snapshot.options.length);
  const options = snapshot.options.map((option, index) => ({
    id: option.id,
    sortKey: option.sortKey ?? (fallbackKeys[index] as string),
    statementLatex: option.statementLatex,
    isCorrect: option.isCorrect,
  }));

  const revisionNumber = await applier.transact(async (tx) => {
    const state = await tx.readStateForUpdate(input.questionId);
    if (state === null) throw new QuestionGoneError(input.questionId);

    const revisionNumber = await tx.writeRevision({
      questionId: input.questionId,
      origin: "USER",
      agentRunId: null,
      summary: input.summary,
      snapshotJson: snapshotOf(state),
    });

    await tx.applyFields(input.questionId, {
      statementLatex: snapshot.statementLatex,
      solutionLatex: snapshot.solutionLatex,
      complementLatex: snapshot.complementLatex,
      nickname: snapshot.nickname,
      // O tipo pode ter mudado depois da revisão (o PATCH da questão aceita trocá-lo); sem
      // restaurá-lo, a "restauração" devolveria uma discursiva com as alternativas de uma múltipla
      // escolha. Revisão antiga não sabe o tipo, e ele fica como está.
      ...(snapshot.type === undefined ? {} : { type: snapshot.type }),
    });
    await tx.restoreOptions(input.questionId, options);
    await tx.applyMetadata(input.questionId, snapshot.metadata);
    await tx.applyTags(input.questionId, snapshot.tags);

    return revisionNumber;
  });

  // Reverter devolve texto e gabarito de antes — e o veredito tem de voltar com eles.
  if (validation) await afterQuestionChanged(validation, input.questionId);
  return revisionNumber;
}

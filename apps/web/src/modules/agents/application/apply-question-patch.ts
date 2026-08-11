import { describeChanges, planApply, snapshotOf, type ApplyPlan } from "../domain/apply-patch";
import type { QuestionState } from "../domain/patch-diff";
import type { QuestionPatch } from "../domain/question-patch";

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
  applyOptions(
    questionId: string,
    options: readonly { id: string; statementLatex?: string; isCorrect?: boolean }[],
  ): Promise<void>;
  applyReorder(questionId: string, optionIds: readonly string[]): Promise<void>;
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
): Promise<ApplyResult> {
  return applier.transact(async (tx) => {
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
): Promise<number> {
  const snapshot = JSON.parse(input.snapshotJson) as QuestionState;

  return applier.transact(async (tx) => {
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
    });
    await tx.applyOptions(
      input.questionId,
      snapshot.options.map((option) => ({
        id: option.id,
        statementLatex: option.statementLatex,
        isCorrect: option.isCorrect,
      })),
    );
    await tx.applyReorder(
      input.questionId,
      snapshot.options.map((option) => option.id),
    );
    await tx.applyMetadata(input.questionId, snapshot.metadata);
    await tx.applyTags(input.questionId, snapshot.tags);

    return revisionNumber;
  });
}

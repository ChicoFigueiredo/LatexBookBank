import type { StorageKey, StorageProvider } from "@/shared/ports";

/**
 * Esvaziar a lixeira — a única operação do produto que apaga de verdade.
 *
 * **A questão que está numa avaliação fica** (#258). A prova referencia a questão, nunca a copia
 * (`AssessmentItem`), e o banco recusa apagá-la (`ON DELETE RESTRICT`). Antes, essa recusa abortava
 * a transação inteira: um item preso a uma prova impedia a lixeira toda de esvaziar, e a tela dizia
 * só "erro". Agora o que a prova usa continua na lixeira, o resto sai, e a resposta diz o que ficou
 * e por qual prova — que é o que a pessoa precisa para decidir (tirar da prova, ou restaurar).
 *
 * Recusar tudo com 409 seria a outra saída, e foi descartada: castigaria os outros itens da lixeira
 * por uma questão que não tem nada com eles.
 */

export interface HeldByAssessment {
  readonly nodeId: string;
  /** "Questão 7 · PA" — o mesmo nome que a linha da lixeira mostra. */
  readonly title: string;
  readonly assessments: readonly string[];
}

export interface TrashPurgeResult {
  readonly nodes: number;
  readonly questions: number;
  readonly held: readonly HeldByAssessment[];
  /** Chaves que nenhuma linha de `Asset` cita mais — as que se pode apagar do disco. */
  readonly orphanedKeys: readonly StorageKey[];
}

export interface TrashPurge {
  purge(): Promise<TrashPurgeResult>;
}

export interface EmptiedTrash {
  readonly deleted: { readonly nodes: number; readonly questions: number };
  readonly held: readonly HeldByAssessment[];
}

export async function emptyTrash(
  trash: TrashPurge,
  storage: StorageProvider,
): Promise<EmptiedTrash> {
  const result = await trash.purge();

  // Best-effort, como na exclusão do livro: o banco já não cita estes arquivos, e um arquivo preso
  // no disco não pode fazer a tela dizer "não deu" sobre uma lixeira que já esvaziou.
  await Promise.all(result.orphanedKeys.map((key) => storage.delete(key).catch(() => undefined)));

  return { deleted: { nodes: result.nodes, questions: result.questions }, held: result.held };
}

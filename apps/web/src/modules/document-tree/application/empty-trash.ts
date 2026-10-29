import type { StorageKey, StorageProvider } from "@/shared/ports";

import { planTrashPurge, type HeldByAssessment, type TrashedNode } from "../domain/trash-purge";

export type { HeldByAssessment } from "../domain/trash-purge";

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
 *
 * O que fica é decidido no domínio (`planTrashPurge`), aqui, com os fatos lidos **dentro** da
 * transação: uma prova montada entre a leitura e a escrita traria a FK de volta.
 */

/** O que o adaptador apagou: as contagens, e as chaves que nenhuma linha de `Asset` cita mais. */
export interface PurgedRows {
  readonly nodes: number;
  readonly questions: number;
  /** As que se pode apagar do disco. */
  readonly orphanedKeys: readonly StorageKey[];
}

/** Os fatos e a exclusão, numa transação. Nenhuma regra: o que sai vem decidido. */
export interface TrashPurgeTransaction {
  /** Os nós na lixeira, do acervo inteiro. */
  listTrashed(): Promise<readonly TrashedNode[]>;
  /** Questão → títulos das avaliações que a usam. Só entram as questões que alguma prova usa. */
  assessmentsUsing(questionIds: readonly string[]): Promise<ReadonlyMap<string, readonly string[]>>;
  /** Apaga os nós e as questões, e diz quais arquivos de render ficaram sem dono. */
  deleteForever(nodeIds: readonly string[], questionIds: readonly string[]): Promise<PurgedRows>;
}

export interface TrashPurge {
  /** Roda tudo dentro de uma transação. Se o callback lançar, nada é apagado. */
  transact<T>(run: (tx: TrashPurgeTransaction) => Promise<T>): Promise<T>;
}

export interface EmptiedTrash {
  readonly deleted: { readonly nodes: number; readonly questions: number };
  readonly held: readonly HeldByAssessment[];
}

export async function emptyTrash(
  trash: TrashPurge,
  storage: StorageProvider,
): Promise<EmptiedTrash> {
  const { purged, held } = await trash.transact(async (tx) => {
    const trashed = await tx.listTrashed();
    const assessments = await tx.assessmentsUsing(
      trashed.flatMap((node) => (node.questionId === null ? [] : [node.questionId])),
    );
    const plan = planTrashPurge(trashed, assessments);
    return { purged: await tx.deleteForever(plan.nodeIds, plan.questionIds), held: plan.held };
  });

  // Best-effort, como na exclusão do livro: o banco já não cita estes arquivos, e um arquivo preso
  // no disco não pode fazer a tela dizer "não deu" sobre uma lixeira que já esvaziou.
  await Promise.all(purged.orphanedKeys.map((key) => storage.delete(key).catch(() => undefined)));

  return { deleted: { nodes: purged.nodes, questions: purged.questions }, held };
}

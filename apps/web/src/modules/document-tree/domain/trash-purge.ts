import { rotular, type NoExcluido } from "./trash-grouping";

/**
 * O que esvaziar a lixeira apaga, e o que fica (#258).
 *
 * **A questão que está numa avaliação fica.** A prova referencia a questão, nunca a copia
 * (`AssessmentItem`), e o banco recusa apagá-la (`ON DELETE RESTRICT`). Ela continua na lixeira com
 * a cadeia de ancestrais que também está lá: sem eles, o `SetNull` de `parentId` a soltaria na
 * raiz, e restaurar já não a devolveria ao lugar.
 *
 * A regra morava no adaptador (`PrismaTrashPurge`), e o caso de uso era um repasse (D71). Aqui ela
 * é uma função dos fatos — o que está na lixeira, e quais provas usam cada questão —, e o adaptador
 * só os responde e apaga o que o plano mandar.
 */

/** Um nó da lixeira, com a questão pendurada nele. */
export interface TrashedNode extends NoExcluido {
  readonly questionId: string | null;
}

export interface HeldByAssessment {
  readonly nodeId: string;
  /** "Questão 7 · PA" — o mesmo nome que a linha da lixeira mostra. */
  readonly title: string;
  readonly assessments: readonly string[];
}

export interface TrashPurgePlan {
  /** Os nós que saem de verdade. */
  readonly nodeIds: readonly string[];
  /** As questões desses nós, que saem com eles. */
  readonly questionIds: readonly string[];
  /** O que fica porque uma prova usa, e por qual prova. */
  readonly held: readonly HeldByAssessment[];
}

/**
 * O plano, dados os nós da lixeira e as provas que usam cada questão (só as usadas aparecem no
 * mapa).
 */
export function planTrashPurge(
  trashed: readonly TrashedNode[],
  assessmentsByQuestion: ReadonlyMap<string, readonly string[]>,
): TrashPurgePlan {
  const byId = new Map(trashed.map((node) => [node.id, node]));
  const heldNodes = trashed.filter(
    (node) => node.questionId !== null && assessmentsByQuestion.has(node.questionId),
  );

  // O nó preso e a cadeia de ancestrais dele que também está na lixeira.
  const staying = new Set<string>();
  for (const held of heldNodes) {
    let current: TrashedNode | undefined = held;
    while (current && !staying.has(current.id)) {
      staying.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }

  const leaving = trashed.filter((node) => !staying.has(node.id));
  return {
    nodeIds: leaving.map((node) => node.id),
    questionIds: leaving.flatMap((node) => (node.questionId === null ? [] : [node.questionId])),
    held: heldNodes.map((node) => ({
      nodeId: node.id,
      title: rotular(node),
      assessments: [...(assessmentsByQuestion.get(node.questionId ?? "") ?? [])].sort(),
    })),
  };
}

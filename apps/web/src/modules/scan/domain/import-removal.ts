/**
 * Apagar uma importação (D57, [ADR 0006](../../../../docs/adr/0006-a-importacao-e-apagavel.md)).
 *
 * Afinar um perfil de captura é um ciclo — varrer, olhar, mudar a regra, varrer de novo — e o
 * ciclo só fecha se der para desfazer o que entrou no acervo. Este módulo decide **o que sai**,
 * sem tocar em nada: recebe os nós que aquela execução criou, já com os sinais de quem mexeu
 * neles, e devolve os que vão para a lixeira e os que ficam, cada um com o motivo.
 *
 * A promessa que ele garante é uma só: **nada editado à mão se perde**. Por isso o motivo é dito
 * por extenso — a confirmação mostra os números antes de apagar, e um número sem motivo não
 * autoriza ninguém a decidir.
 */

/** A folga entre aprovar e gravar. A própria transação da aprovação mexe no nó depois de criá-lo. */
const APPROVAL_WINDOW_MS = 5 * 60 * 1000;

export interface ImportedQuestion {
  /** `DRAFT` é intocado; `READY` é *conferido* — alguém leu contra o PDF (D40). */
  readonly status: string;
  readonly updatedAt: Date;
}

export interface ImportedNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly kind: string;
  readonly title: string | null;
  readonly originalLabel: string | null;
  /** Quando a aprovação criou este nó. */
  readonly approvedAt: Date | null;
  readonly updatedAt: Date;
  readonly question: ImportedQuestion | null;
  /** Tem revisão de origem humana — o sinal mais forte, e o único que não depende de relógio. */
  readonly editedByHand: boolean;
  /**
   * Tem filho vivo que **não** veio desta importação — um capítulo do scan onde alguém pendurou
   * uma seção à mão.
   *
   * Apagar um nó na árvore desce a subárvore inteira, e este filho não está na lista: ele ficaria
   * vivo apontando para um pai excluído, e a árvore o promoveria à raiz do livro sem avisar
   * ninguém. Quem tem filho de fora fica de pé.
   */
  readonly hasOutsideChildren: boolean;
}

export interface KeptNode {
  readonly id: string;
  readonly reason: string;
}

export interface ImportRemovalPlan {
  /** Ids que vão para a lixeira, pais antes dos filhos. */
  readonly trash: readonly string[];
  readonly kept: readonly KeptNode[];
  /** Quantos vão para a lixeira, por tipo de nó — é o que a confirmação mostra. */
  readonly counts: Readonly<Record<string, number>>;
  readonly keptCount: number;
}

/** O que segura um nó de pé, ou `null` quando nada segura. */
function reasonToKeep(node: ImportedNode): string | null {
  if (node.hasOutsideChildren) return "tem filho que não veio desta importação";
  if (node.editedByHand) return "tem revisão feita à mão";
  if (node.question && node.question.status !== "DRAFT") return "conferida";

  const approved = node.approvedAt;
  if (approved === null) return null;
  const limit = approved.getTime() + APPROVAL_WINDOW_MS;

  // A própria aprovação escreve o corpo e as âncoras depois de criar o nó, e um livro de 447
  // páginas leva minutos para entrar. Sem a folga, todo nó pareceria editado à mão.
  if (node.updatedAt.getTime() > limit) return "editado depois de aprovado";
  if (node.question && node.question.updatedAt.getTime() > limit) return "editado depois de aprovado";
  return null;
}

export function planImportRemoval(nodes: readonly ImportedNode[]): ImportRemovalPlan {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const keep = new Map<string, string>();

  for (const node of nodes) {
    const reason = reasonToKeep(node);
    if (reason !== null) keep.set(node.id, reason);
  }

  /*
    O pai de quem fica, fica.

    Apagar um nó na árvore leva a subárvore junto: mandar o capítulo para a lixeira levaria a
    questão conferida com ele — exatamente o que a promessa proíbe. O motivo do pai é outro, e é
    dito com outras palavras, porque ele não foi editado: ele só está segurando quem foi.
  */
  for (const id of [...keep.keys()]) {
    let parentId = byId.get(id)?.parentId ?? null;
    while (parentId !== null && byId.has(parentId) && !keep.has(parentId)) {
      keep.set(parentId, "contém trabalho preservado");
      parentId = byId.get(parentId)?.parentId ?? null;
    }
  }

  const trash: string[] = [];
  const counts: Record<string, number> = {};
  for (const node of nodes) {
    if (keep.has(node.id)) continue;
    trash.push(node.id);
    counts[node.kind] = (counts[node.kind] ?? 0) + 1;
  }

  // Na ordem em que os nós chegaram — que é a da árvore, pais antes dos filhos.
  const kept = nodes.filter((node) => keep.has(node.id)).map((node) => ({ id: node.id, reason: keep.get(node.id)! }));

  return { trash, kept, counts, keptCount: kept.length };
}

import { generateKeyBetween } from "./fractional-index";
import type { TreeNodeRecord } from "./document-tree-repository";

/**
 * As regras de mexer na árvore, sem banco no meio.
 *
 * Tudo aqui é função pura sobre a lista achatada de nós. É o que permite testar o caso que
 * realmente importa — mover um capítulo para dentro de si mesmo — sem subir Prisma, e é o que
 * garante que a regra continue valendo quando o motor mudar (Fase 6.5).
 */

export class NodeNotFoundError extends Error {
  constructor(readonly nodeId: string) {
    super(`Nó ${nodeId} não existe nesta publicação.`);
    this.name = "NodeNotFoundError";
  }
}

export class CyclicMoveError extends Error {
  constructor(
    readonly nodeId: string,
    readonly targetParentId: string,
  ) {
    super(
      `Mover ${nodeId} para dentro de ${targetParentId} criaria um ciclo: ` +
        `o destino está na própria descendência do nó.`,
    );
    this.name = "CyclicMoveError";
  }
}

/**
 * Onde o nó vai parar.
 *
 * Quatro formas cobrem tudo que a spec §4.1 pede — criar filho, criar irmão, mover e reordenar.
 * `parentId: null` é a raiz da publicação.
 */
export type Placement =
  | { readonly kind: "firstChild"; readonly parentId: string | null }
  | { readonly kind: "lastChild"; readonly parentId: string | null }
  | { readonly kind: "before"; readonly siblingId: string }
  | { readonly kind: "after"; readonly siblingId: string };

export interface ResolvedPlacement {
  readonly parentId: string | null;
  readonly sortKey: string;
}

const byId = (records: readonly TreeNodeRecord[]): Map<string, TreeNodeRecord> =>
  new Map(records.map((record) => [record.id, record]));

/** Irmãos de um pai, em ordem, opcionalmente sem um nó — o que está sendo movido. */
function siblingsOf(
  records: readonly TreeNodeRecord[],
  parentId: string | null,
  excludeId?: string,
): TreeNodeRecord[] {
  return records
    .filter((record) => record.parentId === parentId && record.id !== excludeId)
    .sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
}

/**
 * Todos os descendentes de um nó, incluindo ele mesmo.
 *
 * Percorre por `parentId` em vez de recursão sobre uma árvore montada: a lista achatada é o que o
 * repository entrega, e assim a função não depende de `buildTree` ter rodado antes.
 */
export function collectSubtree(
  records: readonly TreeNodeRecord[],
  rootId: string,
): readonly string[] {
  const childrenOf = new Map<string | null, TreeNodeRecord[]>();
  for (const record of records) {
    const list = childrenOf.get(record.parentId);
    if (list) list.push(record);
    else childrenOf.set(record.parentId, [record]);
  }

  const collected: string[] = [];
  const pending = [rootId];
  // Um ciclo já gravado no banco — importação torta, edição concorrente — faria isto rodar para
  // sempre. `seen` transforma o dado corrompido em resultado finito, e o chamador continua vendo
  // a inconsistência em vez de travar.
  const seen = new Set<string>();

  while (pending.length > 0) {
    const id = pending.pop();
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    collected.push(id);
    for (const child of childrenOf.get(id) ?? []) pending.push(child.id);
  }

  return collected;
}

/**
 * Recusa mover um nó para dentro da própria descendência.
 *
 * É a invariante que a spec §42 chama de inviolável, e a que mais estraga em silêncio: o ramo
 * inteiro some da árvore, porque deixa de ser alcançável a partir de qualquer raiz. `buildTree`
 * hoje resgata órfãos promovendo-os, mas resgatar é remendo — a hora de recusar é aqui.
 */
export function assertMoveIsLegal(
  records: readonly TreeNodeRecord[],
  nodeId: string,
  targetParentId: string | null,
): void {
  const index = byId(records);
  if (!index.has(nodeId)) throw new NodeNotFoundError(nodeId);
  if (targetParentId === null) return;
  if (!index.has(targetParentId)) throw new NodeNotFoundError(targetParentId);

  const subtree = new Set(collectSubtree(records, nodeId));
  if (subtree.has(targetParentId)) throw new CyclicMoveError(nodeId, targetParentId);
}

/**
 * Traduz uma posição desejada em `parentId` + `sortKey`.
 *
 * `movingId` existe para o caso de mover: o próprio nó sai da lista de irmãos antes do cálculo.
 * Sem isso, "depois de si mesmo" geraria uma chave entre o nó e ele próprio — limites iguais, e
 * o gerador recusa, com razão.
 */
export function resolvePlacement(
  records: readonly TreeNodeRecord[],
  placement: Placement,
  movingId?: string,
): ResolvedPlacement {
  const index = byId(records);

  if (placement.kind === "firstChild" || placement.kind === "lastChild") {
    const { parentId } = placement;
    if (parentId !== null && !index.has(parentId)) throw new NodeNotFoundError(parentId);

    const siblings = siblingsOf(records, parentId, movingId);
    const first = siblings[0]?.sortKey ?? null;
    const last = siblings[siblings.length - 1]?.sortKey ?? null;

    return {
      parentId,
      sortKey:
        placement.kind === "firstChild"
          ? generateKeyBetween(null, first)
          : generateKeyBetween(last, null),
    };
  }

  const anchor = index.get(placement.siblingId);
  if (!anchor) throw new NodeNotFoundError(placement.siblingId);

  const siblings = siblingsOf(records, anchor.parentId, movingId);
  const position = siblings.findIndex((sibling) => sibling.id === anchor.id);

  const before =
    placement.kind === "before" ? (siblings[position - 1]?.sortKey ?? null) : anchor.sortKey;
  const after =
    placement.kind === "before" ? anchor.sortKey : (siblings[position + 1]?.sortKey ?? null);

  return { parentId: anchor.parentId, sortKey: generateKeyBetween(before, after) };
}

/** Um nó a criar na duplicação, já com pai e chave resolvidos. */
export interface PlannedNode {
  /** Id do nó original — quem executa copia o conteúdo a partir dele. */
  readonly sourceId: string;
  readonly parentId: string | null;
  readonly sortKey: string;
}

/**
 * Planeja a duplicação de uma subárvore inteira.
 *
 * Devolve o plano em **pré-ordem**: o pai sempre antes dos filhos, para que quem executa possa
 * criar em sequência e já conhecer o id novo do pai quando chegar em cada filho. O `parentId` do
 * plano é o **id de origem** do pai — a tradução para o id novo é de quem executa, dentro da
 * transação, porque é lá que os ids nascem.
 *
 * A raiz da cópia entra na posição pedida; os descendentes mantêm a ordem relativa que tinham.
 */
export function planDuplicate(
  records: readonly TreeNodeRecord[],
  nodeId: string,
  placement: Placement,
): readonly PlannedNode[] {
  const index = byId(records);
  if (!index.has(nodeId)) throw new NodeNotFoundError(nodeId);

  const root = resolvePlacement(records, placement);
  const planned: PlannedNode[] = [
    { sourceId: nodeId, parentId: root.parentId, sortKey: root.sortKey },
  ];

  const subtree = new Set(collectSubtree(records, nodeId));
  const visit = (parentSourceId: string): void => {
    for (const child of siblingsOf(records, parentSourceId)) {
      if (!subtree.has(child.id)) continue;
      planned.push({ sourceId: child.id, parentId: parentSourceId, sortKey: child.sortKey });
      visit(child.id);
    }
  };
  visit(nodeId);

  return planned;
}

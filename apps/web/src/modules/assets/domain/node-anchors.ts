/**
 * As âncoras de um nó: várias, em ordem de leitura, cada uma com um papel (D50, ADR 0003).
 *
 * Um exercício que começa no pé de uma página e termina no topo da seguinte é **um** exercício com
 * duas âncoras, não dois exercícios — e um retângulo único que cobrisse as duas páginas não existe.
 * Este arquivo decide como uma lista dessas é válida; quem grava é o adaptador.
 */

export const ANCHOR_ROLES = [
  "PRIMARY",
  "CONTINUATION",
  "ILLUSTRATION",
  "ANSWER",
  "SOLUTION",
  "FOOTNOTE",
] as const;

export type AnchorRole = (typeof ANCHOR_ROLES)[number];

export function isAnchorRole(value: unknown): value is AnchorRole {
  return typeof value === "string" && (ANCHOR_ROLES as readonly string[]).includes(value);
}

export interface NodeAnchorLink {
  readonly sourceAnchorId: string;
  readonly role: AnchorRole;
}

export interface PlannedNodeAnchor extends NodeAnchorLink {
  readonly sortOrder: number;
}

export interface NodeAnchorPlan {
  readonly anchors: readonly PlannedNodeAnchor[];
  /**
   * A âncora que vai para `sourceAnchorId` — a primeira de papel principal, ou a primeira da lista
   * quando nenhuma é principal. `null` quando a lista está vazia: o nó deixa de ter origem.
   */
  readonly primaryAnchorId: string | null;
}

export class InvalidNodeAnchorsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidNodeAnchorsError";
  }
}

/**
 * Valida a lista e numera a ordem.
 *
 * Recusa a mesma âncora duas vezes: a chave da ligação é o par (nó, âncora), e repetir seria pedir
 * que a mesma região fosse lida duas vezes em dois lugares da ordem — o que não descreve página
 * nenhuma.
 */
export function planNodeAnchors(links: readonly NodeAnchorLink[]): NodeAnchorPlan {
  const seen = new Set<string>();

  for (const link of links) {
    if (link.sourceAnchorId.trim() === "") {
      throw new InvalidNodeAnchorsError("Âncora sem identificador.");
    }
    if (!isAnchorRole(link.role)) {
      throw new InvalidNodeAnchorsError(`Papel de âncora desconhecido: ${String(link.role)}.`);
    }
    if (seen.has(link.sourceAnchorId)) {
      throw new InvalidNodeAnchorsError(`A âncora ${link.sourceAnchorId} aparece duas vezes.`);
    }
    seen.add(link.sourceAnchorId);
  }

  const anchors = links.map((link, sortOrder) => ({ ...link, sortOrder }));
  const primary = anchors.find((anchor) => anchor.role === "PRIMARY") ?? anchors[0];

  return { anchors, primaryAnchorId: primary?.sourceAnchorId ?? null };
}

/** Acrescenta uma âncora ao fim, sem repetir. A primeira de um nó vazio é sempre a principal. */
export function appendNodeAnchor(
  current: readonly NodeAnchorLink[],
  sourceAnchorId: string,
  role: AnchorRole = "CONTINUATION",
): readonly NodeAnchorLink[] {
  if (current.some((link) => link.sourceAnchorId === sourceAnchorId)) return current;

  return [...current, { sourceAnchorId, role: current.length === 0 ? "PRIMARY" : role }];
}

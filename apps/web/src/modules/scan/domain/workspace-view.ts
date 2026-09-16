import type { NormalizedBox } from "@modules/assets/domain/source-anchor";

import { LOW_CONFIDENCE, type ReviewState, type ScanKind } from "./proposal";

/**
 * O que a tela de revisão mostra, calculado fora do React (D47): a árvore achatada com
 * profundidade, os filtros e as marcas de cada página. Regra em handler de evento é regra que
 * ninguém testa.
 */

export interface ViewItem {
  readonly id: string;
  readonly key: string;
  readonly parentKey: string | null;
  readonly kind: ScanKind;
  readonly sortOrder: number;
  readonly originalLabel: string | null;
  readonly number: string | null;
  readonly title: string | null;
  readonly text: string;
  readonly confidence: number;
  readonly reviewState: ReviewState;
  readonly documentNodeId: string | null;
  readonly regions: readonly { readonly pageNumber: number; readonly box: NormalizedBox; readonly role: string }[];
  readonly diagnostic: { readonly status: string; readonly reasons: readonly string[] } | null;
}

export interface TreeRow<T extends ViewItem> {
  readonly item: T;
  readonly depth: number;
}

/** A proposta em pré-ordem, com a profundidade de cada item — pai antes dos filhos. */
export function flattenTree<T extends ViewItem>(items: readonly T[]): TreeRow<T>[] {
  const byParent = new Map<string | null, T[]>();
  const keys = new Set(items.map((item) => item.key));
  for (const item of items) {
    // Pai que não está na lista (filtrado ou apagado) conta como raiz: o item não pode sumir.
    const parent = item.parentKey !== null && keys.has(item.parentKey) ? item.parentKey : null;
    const list = byParent.get(parent) ?? [];
    list.push(item);
    byParent.set(parent, list);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);

  const rows: TreeRow<T>[] = [];
  const visit = (parent: string | null, depth: number) => {
    for (const item of byParent.get(parent) ?? []) {
      rows.push({ item, depth });
      visit(item.key, depth + 1);
    }
  };
  visit(null, 0);
  return rows;
}

export const KIND_LABELS: Readonly<Record<ScanKind, string>> = {
  PART: "Parte",
  CHAPTER: "Capítulo",
  SECTION: "Seção",
  SUBSECTION: "Subseção",
  CONTENT: "Texto",
  EXAMPLE: "Exemplo",
  EXERCISE_GROUP: "Exercícios",
  EXERCISE: "Exercício",
  QUESTION: "Questão",
  ITEM: "Item",
  SUBITEM: "Subitem",
  FIGURE: "Figura",
  NOTE: "Nota",
};

export const STATE_LABELS: Readonly<Record<ReviewState, string>> = {
  AUTO_ACCEPTABLE: "sugerido",
  NEEDS_REVIEW: "a revisar",
  APPROVED: "aceito",
  REJECTED: "rejeitado",
};

/** Um rótulo curto para a linha da árvore: o que está impresso, senão o título, senão o texto. */
export function rowLabel(item: ViewItem): string {
  const printed = item.originalLabel ?? (item.number ? `${KIND_LABELS[item.kind]} ${item.number}` : null);
  const title = item.title && item.title !== printed ? item.title : null;
  if (printed && title) return `${printed} — ${title}`;
  const first = item.text.split("\n")[0]?.trim() ?? "";
  // "1." sozinho não diz qual exercício é: o começo do enunciado vem junto.
  if (printed && !title && WITH_SNIPPET.has(item.kind)) {
    const snippet = first.startsWith(printed) ? first.slice(printed.length).trim() : first;
    return clip(snippet ? `${printed} ${snippet}` : printed);
  }
  if (printed ?? title) return (printed ?? title) as string;
  return clip(first) || KIND_LABELS[item.kind];
}

const WITH_SNIPPET: ReadonlySet<ScanKind> = new Set(["EXERCISE", "QUESTION", "ITEM", "SUBITEM", "EXAMPLE"]);
const clip = (text: string) => (text.length > 60 ? `${text.slice(0, 57)}…` : text);

export type ViewFilter = "all" | "pending" | "low" | "problems" | "structure";

export const FILTER_LABELS: Readonly<Record<ViewFilter, string>> = {
  all: "Tudo",
  pending: "A decidir",
  low: "Duvidosos",
  problems: "Diagnóstico",
  structure: "Estrutura",
};

const STRUCTURE: ReadonlySet<ScanKind> = new Set(["PART", "CHAPTER", "SECTION", "SUBSECTION", "EXERCISE_GROUP"]);

export function matchesFilter(item: ViewItem, filter: ViewFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "pending":
      return !item.documentNodeId && (item.reviewState === "NEEDS_REVIEW" || item.reviewState === "AUTO_ACCEPTABLE");
    case "low":
      return item.confidence < LOW_CONFIDENCE;
    case "problems":
      return item.diagnostic !== null && item.diagnostic.status !== "complete";
    case "structure":
      return STRUCTURE.has(item.kind);
  }
}

/**
 * O filtro não esconde o caminho: um item que passa leva os ancestrais junto, para a árvore
 * continuar dizendo onde ele está.
 */
export function filterWithAncestors<T extends ViewItem>(items: readonly T[], filter: ViewFilter): T[] {
  if (filter === "all") return [...items];
  const byKey = new Map(items.map((item) => [item.key, item]));
  const keep = new Set<string>();
  for (const item of items) {
    if (!matchesFilter(item, filter)) continue;
    let current: T | undefined = item;
    while (current && !keep.has(current.key)) {
      keep.add(current.key);
      current = current.parentKey ? byKey.get(current.parentKey) : undefined;
    }
  }
  return items.filter((item) => keep.has(item.key));
}

export type OverlayTone = "selected" | "structure" | "question" | "content" | "rejected" | "accepted" | "warning";

export interface Overlay {
  readonly id: string;
  readonly regionIndex: number;
  readonly box: NormalizedBox;
  readonly tone: OverlayTone;
  readonly label: string;
}

/** As marcas de uma página: todas as âncoras que caem nela, com a do item escolhido por cima. */
export function overlaysForPage(
  items: readonly ViewItem[],
  pageNumber: number,
  selectedId: string | null,
): Overlay[] {
  const overlays: Overlay[] = [];
  for (const item of items) {
    item.regions.forEach((region, regionIndex) => {
      if (region.pageNumber !== pageNumber) return;
      overlays.push({
        id: item.id,
        regionIndex,
        box: region.box,
        tone: toneOf(item, item.id === selectedId),
        label: `${KIND_LABELS[item.kind]}${item.number ? ` ${item.number}` : ""}${item.regions.length > 1 ? ` · ${regionIndex + 1}/${item.regions.length}` : ""}`,
      });
    });
  }
  // O escolhido por último: desenhado por cima, clicável mesmo dentro do pai.
  return overlays.sort((a, b) => Number(a.tone === "selected") - Number(b.tone === "selected") || area(b.box) - area(a.box));
}

const area = (box: NormalizedBox) => box.width * box.height;

function toneOf(item: ViewItem, selected: boolean): OverlayTone {
  if (selected) return "selected";
  if (item.reviewState === "REJECTED") return "rejected";
  if (item.documentNodeId || item.reviewState === "APPROVED") return "accepted";
  if (item.diagnostic && item.diagnostic.status !== "complete") return "warning";
  if (STRUCTURE.has(item.kind)) return "structure";
  if (item.kind === "EXERCISE" || item.kind === "QUESTION" || item.kind === "ITEM" || item.kind === "SUBITEM") return "question";
  return "content";
}

/** A próxima âncora do item, dando a volta. Serve ao "região 2 de 3 ▶". */
export function cycleRegion(count: number, current: number, step: 1 | -1): number {
  if (count <= 0) return 0;
  return (current + step + count) % count;
}

export function countsByState(items: readonly ViewItem[]) {
  const pending = items.filter((item) => !item.documentNodeId);
  return {
    suggested: pending.filter((item) => item.reviewState === "AUTO_ACCEPTABLE").length,
    needsReview: pending.filter((item) => item.reviewState === "NEEDS_REVIEW").length,
    accepted: pending.filter((item) => item.reviewState === "APPROVED").length,
    rejected: items.filter((item) => item.reviewState === "REJECTED").length,
    inCollection: items.filter((item) => item.documentNodeId).length,
    lowConfidence: items.filter((item) => item.confidence < LOW_CONFIDENCE).length,
  };
}

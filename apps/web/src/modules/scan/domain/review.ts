import { isAnchorRole, type AnchorRole } from "@modules/assets/domain/node-anchors";
import { normalizeAnchor, type NormalizedBox } from "@modules/assets/domain/source-anchor";

import type { CaptureProfile } from "./capture-profile";
import { isScanKind, type ProposedRegion, type ScanKind } from "./proposal";
import type { ScanItem } from "./scan-item";

/**
 * As operações de revisão da proposta (§36 do prompt 03).
 *
 * Funções puras: recebem a proposta inteira e devolvem só o que muda. Cada uma confere o que a
 * tela não pode garantir sozinha — o tipo que o pai aceita, o ciclo, a âncora dentro da página —
 * e nenhuma apaga o que o scan propôs: o retrato em `proposed` atravessa tudo (§44, §59).
 *
 * Um item que já virou acervo está travado: a partir dali, quem edita é o editor.
 */

export type ReviewOperation =
  | { readonly type: "setKind"; readonly itemId: string; readonly kind: string }
  | { readonly type: "setTitle"; readonly itemId: string; readonly title: string | null }
  | { readonly type: "setLabel"; readonly itemId: string; readonly label: string | null }
  | { readonly type: "reparent"; readonly itemId: string; readonly parentId: string | null }
  | { readonly type: "promote"; readonly itemId: string }
  | { readonly type: "demote"; readonly itemId: string }
  | { readonly type: "merge"; readonly itemIds: readonly string[] }
  | { readonly type: "split"; readonly itemId: string; readonly regionIndex: number }
  | { readonly type: "addRegion"; readonly itemId: string; readonly region: ProposedRegion }
  | { readonly type: "removeRegion"; readonly itemId: string; readonly regionIndex: number }
  | { readonly type: "resizeRegion"; readonly itemId: string; readonly regionIndex: number; readonly box: NormalizedBox }
  | { readonly type: "moveRegion"; readonly itemId: string; readonly from: number; readonly to: number }
  | { readonly type: "setRegionRole"; readonly itemId: string; readonly regionIndex: number; readonly role: string }
  | { readonly type: "editText"; readonly itemId: string; readonly text: string | null }
  | { readonly type: "editLatex"; readonly itemId: string; readonly latex: string | null }
  | { readonly type: "accept"; readonly itemIds: readonly string[] }
  | { readonly type: "reject"; readonly itemIds: readonly string[] }
  | { readonly type: "reopen"; readonly itemIds: readonly string[] }
  | { readonly type: "acceptSuggested" }
  | {
      readonly type: "addItem";
      readonly kind: string;
      readonly parentId: string | null;
      readonly afterId: string | null;
      readonly region: ProposedRegion;
      readonly title?: string | null;
    };

export const REVIEW_OPERATION_TYPES = [
  "setKind",
  "setTitle",
  "setLabel",
  "reparent",
  "promote",
  "demote",
  "merge",
  "split",
  "addRegion",
  "removeRegion",
  "resizeRegion",
  "moveRegion",
  "setRegionRole",
  "editText",
  "editLatex",
  "accept",
  "reject",
  "reopen",
  "acceptSuggested",
  "addItem",
] as const;

export class InvalidReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidReviewError";
  }
}

export interface ReviewResult {
  readonly upserts: readonly ScanItem[];
  readonly deletedIds: readonly string[];
}

interface Context {
  readonly items: readonly ScanItem[];
  readonly profile: CaptureProfile;
  readonly newId: () => string;
}

export function applyReview(
  items: readonly ScanItem[],
  operation: ReviewOperation,
  profile: CaptureProfile,
  newId: () => string,
): ReviewResult {
  const context: Context = { items, profile, newId };

  switch (operation.type) {
    case "setKind":
      return setKind(context, operation.itemId, operation.kind);
    case "setTitle":
      return patch(context, operation.itemId, { title: clean(operation.title) });
    case "setLabel":
      return patch(context, operation.itemId, { originalLabel: clean(operation.label) });
    case "reparent":
      return reparent(context, operation.itemId, operation.parentId);
    case "promote":
      return promote(context, operation.itemId);
    case "demote":
      return demote(context, operation.itemId);
    case "merge":
      return merge(context, operation.itemIds);
    case "split":
      return split(context, operation.itemId, operation.regionIndex);
    case "addRegion":
      return withRegions(context, operation.itemId, (regions) => [...regions, validRegion(operation.region)]);
    case "removeRegion":
      return withRegions(context, operation.itemId, (regions) => {
        at(regions, operation.regionIndex);
        return regions.filter((_, index) => index !== operation.regionIndex);
      });
    case "resizeRegion":
      return withRegions(context, operation.itemId, (regions) =>
        regions.map((region, index) =>
          index === operation.regionIndex ? validRegion({ ...region, box: operation.box }) : region,
        ),
      );
    case "moveRegion":
      return withRegions(context, operation.itemId, (regions) => {
        const moved = at(regions, operation.from);
        at(regions, operation.to);
        const rest = regions.filter((_, index) => index !== operation.from);
        return [...rest.slice(0, operation.to), moved, ...rest.slice(operation.to)];
      });
    case "setRegionRole":
      return withRegions(context, operation.itemId, (regions) => {
        if (!isAnchorRole(operation.role)) throw new InvalidReviewError(`Papel desconhecido: ${operation.role}.`);
        at(regions, operation.regionIndex);
        return regions.map((region, index) =>
          index === operation.regionIndex ? { ...region, role: operation.role as AnchorRole } : region,
        );
      });
    case "editText":
      return patch(context, operation.itemId, { reviewedText: operation.text });
    case "editLatex":
      return patch(context, operation.itemId, { reviewedLatex: operation.latex });
    case "accept":
      return setStates(context, operation.itemIds, "APPROVED");
    case "reject":
      return setStates(context, operation.itemIds, "REJECTED");
    case "reopen":
      return setStates(context, operation.itemIds, "NEEDS_REVIEW");
    case "acceptSuggested":
      return setStates(
        context,
        items.filter((item) => item.reviewState === "AUTO_ACCEPTABLE" && !item.documentNodeId).map((item) => item.id),
        "APPROVED",
      );
    case "addItem":
      return addItem(context, operation);
  }
}

const clean = (value: string | null): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

function find(context: Context, id: string): ScanItem {
  const item = context.items.find((candidate) => candidate.id === id);
  if (!item) throw new InvalidReviewError("Item da proposta não encontrado.");
  return item;
}

function editable(context: Context, id: string): ScanItem {
  const item = find(context, id);
  if (item.documentNodeId) {
    throw new InvalidReviewError("Este item já está no acervo; corrija-o no editor.");
  }
  return item;
}

function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) throw new InvalidReviewError("Âncora inexistente.");
  return value;
}

function validRegion(region: ProposedRegion): ProposedRegion {
  if (!isAnchorRole(region.role)) throw new InvalidReviewError(`Papel desconhecido: ${String(region.role)}.`);
  try {
    const normalized = normalizeAnchor({ pageNumber: region.pageNumber, box: region.box, rotation: null });
    return { pageNumber: normalized.pageNumber, box: normalized.box, role: region.role };
  } catch (error) {
    throw new InvalidReviewError(error instanceof Error ? error.message : "Âncora inválida.");
  }
}

const parentOf = (context: Context, item: ScanItem): ScanItem | null =>
  item.parentKey ? (context.items.find((c) => c.key === item.parentKey) ?? null) : null;

const childrenOf = (context: Context, item: ScanItem): ScanItem[] =>
  context.items.filter((c) => c.parentKey === item.key);

function assertFits(context: Context, parent: ScanItem | null, kind: ScanKind): void {
  if (!context.profile.canContain(parent?.kind ?? null, kind)) {
    throw new InvalidReviewError(
      `${parent ? `Um ${parent.kind}` : "A raiz"} não pode conter ${kind} neste perfil.`,
    );
  }
}

function patch(context: Context, id: string, change: Partial<ScanItem>): ReviewResult {
  const item = editable(context, id);
  // Quem mexe tira o selo de sugestão: o item passa a ser decisão de alguém, não do scan.
  const reviewState = item.reviewState === "AUTO_ACCEPTABLE" ? "NEEDS_REVIEW" : item.reviewState;
  return { upserts: [{ ...item, reviewState, ...change }], deletedIds: [] };
}

function setKind(context: Context, id: string, raw: string): ReviewResult {
  if (!isScanKind(raw) || !context.profile.kinds.includes(raw)) {
    throw new InvalidReviewError(`O perfil ${context.profile.id} não conhece o tipo ${raw}.`);
  }
  const item = editable(context, id);
  assertFits(context, parentOf(context, item), raw);
  for (const child of childrenOf(context, item)) {
    if (!context.profile.canContain(raw, child.kind)) {
      throw new InvalidReviewError(`Um ${raw} não pode conter o ${child.kind} que está abaixo dele.`);
    }
  }
  return patch(context, id, { kind: raw });
}

function isDescendant(context: Context, ancestor: ScanItem, candidate: ScanItem | null): boolean {
  let current = candidate;
  while (current) {
    if (current.key === ancestor.key) return true;
    current = parentOf(context, current);
  }
  return false;
}

function reparent(context: Context, id: string, parentId: string | null): ReviewResult {
  const item = editable(context, id);
  const parent = parentId === null ? null : find(context, parentId);
  if (parent && isDescendant(context, item, parent)) {
    throw new InvalidReviewError("Um item não pode ficar dentro de si mesmo.");
  }
  assertFits(context, parent, item.kind);
  return patch(context, id, { parentKey: parent?.key ?? null });
}

function promote(context: Context, id: string): ReviewResult {
  const item = editable(context, id);
  const parent = parentOf(context, item);
  if (!parent) throw new InvalidReviewError("O item já está na raiz.");
  const grandparent = parentOf(context, parent);
  assertFits(context, grandparent, item.kind);
  return patch(context, id, { parentKey: grandparent?.key ?? null });
}

function demote(context: Context, id: string): ReviewResult {
  const item = editable(context, id);
  const siblings = context.items
    .filter((c) => c.parentKey === item.parentKey && c.sortOrder < item.sortOrder)
    .sort((a, b) => b.sortOrder - a.sortOrder);
  const target = siblings.find((sibling) => context.profile.canContain(sibling.kind, item.kind));
  if (!target) throw new InvalidReviewError("Não há item acima que possa conter este.");
  return patch(context, id, { parentKey: target.key });
}

function merge(context: Context, ids: readonly string[]): ReviewResult {
  if (ids.length < 2) throw new InvalidReviewError("Escolha pelo menos dois itens para unir.");
  const selected = ids.map((id) => editable(context, id)).sort((a, b) => a.sortOrder - b.sortOrder);
  const [first, ...rest] = selected;
  if (!first) throw new InvalidReviewError("Nada para unir.");
  if (rest.some((item) => item.kind !== first.kind)) {
    throw new InvalidReviewError("Só itens do mesmo tipo se unem.");
  }

  const merged: ScanItem = {
    ...first,
    regions: selected.flatMap((item, i) =>
      item.regions.map((region, j) => ({ ...region, role: i === 0 && j === 0 ? region.role : region.role === "PRIMARY" ? "CONTINUATION" : region.role })),
    ),
    text: selected.map((item) => item.text).join("\n"),
    latex: selected.every((item) => item.latex !== null) ? selected.map((item) => item.latex).join("\n") : null,
    reviewedText: selected.some((i) => i.reviewedText !== null)
      ? selected.map((i) => i.reviewedText ?? i.text).join("\n")
      : null,
    reviewedLatex: selected.some((i) => i.reviewedLatex !== null)
      ? selected.map((i) => i.reviewedLatex ?? i.latex ?? "").join("\n")
      : null,
    needsMath: selected.some((item) => item.needsMath),
    mathResult: null,
    evidence: [...first.evidence, `unido a ${rest.length} item(ns) na revisão`],
    origin: "MERGE",
    reviewState: "NEEDS_REVIEW",
  };

  const removed = new Set(rest.map((item) => item.key));
  const adopted = context.items
    .filter((item) => item.parentKey !== null && removed.has(item.parentKey))
    .map((item) => ({ ...item, parentKey: first.key }));

  return { upserts: [merged, ...adopted], deletedIds: rest.map((item) => item.id) };
}

function split(context: Context, id: string, regionIndex: number): ReviewResult {
  const item = editable(context, id);
  if (regionIndex <= 0 || regionIndex >= item.regions.length) {
    throw new InvalidReviewError("Separe a partir da segunda âncora: a primeira fica com o item.");
  }
  const kept = item.regions.slice(0, regionIndex);
  const moved = item.regions.slice(regionIndex).map((region, index) => ({
    ...region,
    role: index === 0 ? ("PRIMARY" as const) : region.role,
  }));
  const second = moved[0] as ProposedRegion;

  const createdId = context.newId();
  const created: ScanItem = {
    ...item,
    id: createdId,
    key: `SPLIT:${createdId}`,
    sortOrder: item.sortOrder,
    regions: moved,
    pageNumber: second.pageNumber,
    originalLabel: null,
    number: null,
    title: null,
    // O texto de cada metade não é conhecido: o reconhecimento ou a pessoa o preenche.
    text: "",
    latex: null,
    reviewedText: null,
    reviewedLatex: null,
    mathResult: null,
    aiDecision: null,
    evidence: [`separado de ${item.originalLabel ?? item.kind} na revisão`],
    origin: "SPLIT",
    reviewState: "NEEDS_REVIEW",
    proposed: { ...item.proposed, regions: [], text: "", latex: null },
  };

  const shifted = context.items
    .filter((other) => other.sortOrder > item.sortOrder)
    .map((other) => ({ ...other, sortOrder: other.sortOrder + 1 }));

  return {
    upserts: [
      { ...item, regions: kept, mathResult: null, reviewState: "NEEDS_REVIEW" },
      { ...created, sortOrder: item.sortOrder + 1 },
      ...shifted,
    ],
    deletedIds: [],
  };
}

function withRegions(
  context: Context,
  id: string,
  change: (regions: readonly ProposedRegion[]) => readonly ProposedRegion[],
): ReviewResult {
  const item = editable(context, id);
  const regions = change(item.regions);
  if (regions.length === 0) throw new InvalidReviewError("O item precisa de pelo menos uma âncora; rejeite-o em vez disso.");
  // A primeira âncora é a principal; mudar a ordem muda quem responde pela origem.
  const normalized = regions.map((region, index): ProposedRegion => {
    if (index === 0 && region.role === "CONTINUATION") return { ...region, role: "PRIMARY" };
    if (index > 0 && region.role === "PRIMARY") return { ...region, role: "CONTINUATION" };
    return region;
  });
  // Âncora mudou, o reconhecimento feito sobre as antigas não vale mais.
  return patch(context, id, { regions: normalized, mathResult: null, pageNumber: normalized[0]?.pageNumber ?? item.pageNumber });
}

function setStates(context: Context, ids: readonly string[], state: ScanItem["reviewState"]): ReviewResult {
  const upserts = ids
    .map((id) => find(context, id))
    .filter((item) => !item.documentNodeId && item.reviewState !== state)
    .map((item) => ({ ...item, reviewState: state }));
  return { upserts, deletedIds: [] };
}

function addItem(
  context: Context,
  operation: Extract<ReviewOperation, { type: "addItem" }>,
): ReviewResult {
  const kind = operation.kind;
  if (!isScanKind(kind) || !context.profile.kinds.includes(kind)) {
    throw new InvalidReviewError(`O perfil ${context.profile.id} não conhece o tipo ${kind}.`);
  }
  const parent = operation.parentId ? find(context, operation.parentId) : null;
  assertFits(context, parent, kind);
  const after = operation.afterId ? find(context, operation.afterId) : parent;
  const sortOrder = after ? after.sortOrder + 1 : context.items.length;
  const region = validRegion({ ...operation.region, role: "PRIMARY" });

  const createdId = context.newId();
  const created: ScanItem = {
    id: createdId,
    key: `MANUAL:${createdId}`,
    parentKey: parent?.key ?? null,
    kind,
    originalLabel: null,
    number: null,
    title: clean(operation.title ?? null),
    pageNumber: region.pageNumber,
    printedPage: null,
    regions: [region],
    text: "",
    latex: null,
    needsMath: true,
    confidence: 1,
    confidenceParts: {},
    evidence: ["marcado à mão na revisão"],
    diagnostic: null,
    metadata: {},
    reviewState: "NEEDS_REVIEW",
    sortOrder,
    reviewedText: null,
    reviewedLatex: null,
    proposed: {
      kind,
      parentKey: parent?.key ?? null,
      title: null,
      originalLabel: null,
      number: null,
      regions: [],
      text: "",
      latex: null,
      confidence: 0,
    },
    origin: "MANUAL",
    aiDecision: null,
    mathResult: null,
    documentNodeId: null,
    approvedAt: null,
  };

  const shifted = context.items
    .filter((other) => other.sortOrder >= sortOrder)
    .map((other) => ({ ...other, sortOrder: other.sortOrder + 1 }));

  return { upserts: [created, ...shifted], deletedIds: [] };
}

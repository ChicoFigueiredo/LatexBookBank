import type { ProposedItem, ScanKind } from "./proposal";

/**
 * Um item da proposta depois de gravado: o que o scan propôs, o que a IA e o reconhecimento
 * matemático acrescentaram, e o que a pessoa corrigiu — tudo lado a lado (§44, §45, §59).
 */

export const ITEM_ORIGINS = ["SCAN", "MANUAL", "SPLIT", "MERGE"] as const;
export type ItemOrigin = (typeof ITEM_ORIGINS)[number];

/** O retrato do que o scan propôs. Nunca reescrito depois de gravado. */
export type ProposedSnapshot = Pick<
  ProposedItem,
  "kind" | "parentKey" | "title" | "originalLabel" | "number" | "regions" | "text" | "latex" | "confidence"
>;

export interface MathResult {
  readonly latex: string;
  readonly confidence: number | null;
  readonly alternatives: readonly string[];
  readonly providerId: string;
  readonly model: string;
  readonly durationMs: number;
  readonly recognizedAt: string;
}

export interface AiDecision {
  readonly previousKind: ScanKind;
  readonly kind: ScanKind;
  readonly confidence: number;
  readonly reason: string;
  readonly providerId: string;
  readonly model: string;
  readonly decidedAt: string;
}

export interface ScanItem extends ProposedItem {
  readonly id: string;
  readonly sortOrder: number;
  readonly reviewedText: string | null;
  readonly reviewedLatex: string | null;
  readonly proposed: ProposedSnapshot;
  readonly origin: ItemOrigin;
  readonly aiDecision: AiDecision | null;
  readonly mathResult: MathResult | null;
  readonly documentNodeId: string | null;
  readonly approvedAt: string | null;
}

export function snapshotOf(item: ProposedItem): ProposedSnapshot {
  return {
    kind: item.kind,
    parentKey: item.parentKey,
    title: item.title,
    originalLabel: item.originalLabel,
    number: item.number,
    regions: item.regions,
    text: item.text,
    latex: item.latex,
    confidence: item.confidence,
  };
}

/** O LaTeX que vale agora: o revisado, senão o do reconhecimento, senão o da camada de texto. */
export const effectiveLatex = (item: ScanItem): string | null =>
  item.reviewedLatex ?? item.mathResult?.latex ?? item.latex;

export const effectiveText = (item: ScanItem): string => item.reviewedText ?? item.text;

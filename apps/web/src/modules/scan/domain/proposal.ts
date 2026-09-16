import type { AnchorRole } from "@modules/assets/domain/node-anchors";
import type { NormalizedBox } from "@modules/assets/domain/source-anchor";

/**
 * A proposta de scan: o que um scan entendeu de um livro, antes de virar acervo (D45).
 *
 * O vocabulário daqui é mais rico que `NodeKind` de propósito — exemplo, exercício, item — e a
 * aprovação o traduz (ADR 0002). Nada neste arquivo toca o acervo.
 */

export const SCAN_KINDS = [
  "PART",
  "CHAPTER",
  "SECTION",
  "SUBSECTION",
  "CONTENT",
  "EXAMPLE",
  "EXERCISE_GROUP",
  "EXERCISE",
  "QUESTION",
  "ITEM",
  "SUBITEM",
  "FIGURE",
  "NOTE",
] as const;

export type ScanKind = (typeof SCAN_KINDS)[number];

export const isScanKind = (value: unknown): value is ScanKind =>
  typeof value === "string" && (SCAN_KINDS as readonly string[]).includes(value);

/** Os tipos que são título: a âncora deles é a linha do título, e o conteúdo vem nos filhos. */
export const HEADING_KINDS: ReadonlySet<ScanKind> = new Set([
  "PART",
  "CHAPTER",
  "SECTION",
  "SUBSECTION",
  "EXERCISE_GROUP",
]);

/**
 * O estado de revisão de um item (§37 do prompt 03).
 *
 * `AUTO_ACCEPTABLE` é uma **sugestão** do scan, não uma aprovação: entra na aprovação em lote, mas
 * aparece na tela como qualquer outro. Baixa confiança nunca é escondida.
 */
export const REVIEW_STATES = ["AUTO_ACCEPTABLE", "NEEDS_REVIEW", "APPROVED", "REJECTED"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

export const isReviewState = (value: unknown): value is ReviewState =>
  typeof value === "string" && (REVIEW_STATES as readonly string[]).includes(value);

/** Uma âncora proposta: página, caixa normalizada, papel e ordem. */
export interface ProposedRegion {
  readonly pageNumber: number;
  readonly box: NormalizedBox;
  readonly role: AnchorRole;
}

/**
 * A confiança em partes (§28). Cada parte é opcional: um perfil que não olha tipografia não
 * inventa nota de tipografia. O total é a média das partes presentes — serve para ordenar a
 * revisão, não para fingir precisão.
 */
export interface ConfidenceParts {
  readonly pattern?: number;
  readonly typography?: number;
  readonly layout?: number;
  readonly continuity?: number;
  readonly semantic?: number;
}

export function combineConfidence(parts: ConfidenceParts): number {
  const values = Object.values(parts).filter((v): v is number => typeof v === "number");
  if (values.length === 0) return 0.5;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.round(Math.min(1, Math.max(0, mean)) * 100) / 100;
}

/** §30 e §56: o diagnóstico diz o estado **e** por quê. */
export const DIAGNOSTIC_STATUSES = [
  "complete",
  "incomplete",
  "suspicious",
  "insufficient_evidence",
] as const;
export type DiagnosticStatus = (typeof DIAGNOSTIC_STATUSES)[number];

export interface Diagnostic {
  readonly status: DiagnosticStatus;
  readonly reasons: readonly string[];
  /** Fatos que o perfil mediu — `alternativesFound`, `crossesPage`… —, para a tela e o relatório. */
  readonly facts: Readonly<Record<string, string | number | boolean | readonly string[]>>;
}

export interface ProposedItem {
  /** Chave estável dentro da proposta: é por ela que pai e filho se acham, e que dois scans se comparam. */
  readonly key: string;
  readonly parentKey: string | null;
  readonly kind: ScanKind;
  /** O rótulo como está impresso: "Capítulo 4", "Exercício 12", "a)". Nunca inventado. */
  readonly originalLabel: string | null;
  readonly number: string | null;
  readonly title: string | null;
  readonly pageNumber: number;
  /** O número impresso da página, quando o livro permitiu deduzi-lo. */
  readonly printedPage: string | null;
  readonly regions: readonly ProposedRegion[];
  readonly text: string;
  /** LaTeX da camada de texto, quando o texto não tem matemática; `null` quando precisa de reconhecimento. */
  readonly latex: string | null;
  readonly needsMath: boolean;
  readonly confidence: number;
  readonly confidenceParts: ConfidenceParts;
  readonly evidence: readonly string[];
  readonly diagnostic: Diagnostic | null;
  /** O que o perfil sabe e o acervo não precisa guardar em coluna: língua, faixa de questões. */
  readonly metadata: Readonly<Record<string, string | number>>;
  readonly reviewState: ReviewState;
}

export interface ProposalMetrics {
  readonly pages: number;
  readonly scannedPages: number;
  readonly items: number;
  readonly byKind: Readonly<Partial<Record<ScanKind, number>>>;
  readonly regions: number;
  readonly lowConfidence: number;
  readonly multiRegion: number;
  readonly multiPage: number;
  readonly byDiagnostic: Readonly<Partial<Record<DiagnosticStatus, number>>>;
}

export interface Proposal {
  readonly items: readonly ProposedItem[];
  readonly warnings: readonly string[];
  readonly metrics: ProposalMetrics;
  /** PDF página − página impressa, quando o livro deixou medir. */
  readonly pageOffset: number | null;
}

/** Abaixo disto, "baixa confiança" no relatório (§58). */
export const LOW_CONFIDENCE = 0.7;

export function measure(
  items: readonly ProposedItem[],
  pages: number,
  scannedPages: number,
): ProposalMetrics {
  const byKind: Partial<Record<ScanKind, number>> = {};
  const byDiagnostic: Partial<Record<DiagnosticStatus, number>> = {};

  for (const item of items) {
    byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;
    if (item.diagnostic) {
      byDiagnostic[item.diagnostic.status] = (byDiagnostic[item.diagnostic.status] ?? 0) + 1;
    }
  }

  return {
    pages,
    scannedPages,
    items: items.length,
    byKind,
    regions: items.reduce((sum, item) => sum + item.regions.length, 0),
    lowConfidence: items.filter((item) => item.confidence < LOW_CONFIDENCE).length,
    multiRegion: items.filter((item) => item.regions.length > 1).length,
    multiPage: items.filter((item) => new Set(item.regions.map((r) => r.pageNumber)).size > 1)
      .length,
    byDiagnostic,
  };
}

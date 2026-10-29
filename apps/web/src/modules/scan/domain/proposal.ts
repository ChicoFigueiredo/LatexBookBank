import type { AnchorRole } from "@modules/assets/domain/node-anchors";
import type { NormalizedBox } from "@/shared/geometry/normalized-box";
import type { NodeKind } from "@modules/document-tree/domain/node-kind";

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

/**
 * Os traços de cada tipo, num lugar só (STM-13 da revisão de 2026-09-23).
 *
 * Antes, o que cada tipo é estava em nove conjuntos em seis arquivos — título, nó da aprovação,
 * corpo, questão, sumário, reconhecimento, reclassificação — e um tipo novo esquecido num deles
 * não quebrava a compilação: o item só deixava de ser reconhecido, de aparecer no filtro ou de
 * virar nó. O `Record` completo é o que faz o compilador cobrar cada tipo novo aqui; os conjuntos
 * de cada passada derivam desta tabela (`kindsWhere`).
 */
export interface ScanKindTraits {
  /** Como a tela o nomeia. */
  readonly label: string;
  /** É título: a âncora é a linha do título, e o conteúdo vem nos filhos. */
  readonly heading: boolean;
  /** O sumário do livro o cita, e por isso ele confere o que o scan achou. */
  readonly inToc: boolean;
  /**
   * O que a aprovação faz dele (ADR 0002): vira nó da árvore, vira questão, entra no corpo do nó
   * de cima, ou é dobrado no enunciado da questão que o contém.
   */
  readonly approvesAs: "node" | "question" | "body" | "folded";
  /** O tipo do nó, quando a aprovação o faz nó. */
  readonly nodeKind: NodeKind | null;
  /**
   * A família entre cujos tipos o texto revisado ainda faz sentido ao trocar de perfil (#250): o
   * LaTeX corrigido de um parágrafo, posto como título de uma seção, é texto no lugar errado.
   */
  readonly family: "título" | "texto" | "questão" | "item" | "figura";
  /**
   * Vai ao reconhecimento de matemática. Item e subitem ficam de fora: o exercício que os contém
   * já os reconhece inteiros.
   */
  readonly recognizesMath: boolean;
  /** A IA pode trocar o tipo. Título numerado e questão de prova têm evidência forte demais. */
  readonly reclassifiable: boolean;
  /** A linha da árvore mostra o começo do texto ao lado do rótulo: "1." sozinho não diz qual é. */
  readonly withSnippet: boolean;
}

export const SCAN_KIND_TRAITS: Readonly<Record<ScanKind, ScanKindTraits>> = {
  PART: {
    label: "Parte",
    heading: true,
    inToc: true,
    approvesAs: "node",
    nodeKind: "PART",
    family: "título",
    recognizesMath: false,
    reclassifiable: false,
    withSnippet: false,
  },
  CHAPTER: {
    label: "Capítulo",
    heading: true,
    inToc: true,
    approvesAs: "node",
    nodeKind: "CHAPTER",
    family: "título",
    recognizesMath: false,
    reclassifiable: false,
    withSnippet: false,
  },
  SECTION: {
    label: "Seção",
    heading: true,
    inToc: true,
    approvesAs: "node",
    nodeKind: "SECTION",
    family: "título",
    recognizesMath: false,
    reclassifiable: true,
    withSnippet: false,
  },
  SUBSECTION: {
    label: "Subseção",
    heading: true,
    inToc: true,
    approvesAs: "node",
    nodeKind: "SUBSECTION",
    family: "título",
    recognizesMath: false,
    reclassifiable: true,
    withSnippet: false,
  },
  CONTENT: {
    label: "Texto",
    heading: false,
    inToc: false,
    approvesAs: "body",
    nodeKind: null,
    family: "texto",
    recognizesMath: true,
    reclassifiable: true,
    withSnippet: false,
  },
  // D56: o exemplo tem endereço próprio, e por isso é nó — e não mais texto no corpo da seção.
  EXAMPLE: {
    label: "Exemplo",
    heading: false,
    inToc: false,
    approvesAs: "node",
    nodeKind: "EXAMPLE",
    family: "texto",
    recognizesMath: true,
    reclassifiable: true,
    withSnippet: true,
  },
  EXERCISE_GROUP: {
    label: "Exercícios",
    heading: true,
    inToc: false,
    approvesAs: "node",
    nodeKind: "QUESTION_GROUP",
    family: "título",
    recognizesMath: false,
    reclassifiable: false,
    withSnippet: false,
  },
  EXERCISE: {
    label: "Exercício",
    heading: false,
    inToc: false,
    approvesAs: "question",
    nodeKind: null,
    family: "questão",
    recognizesMath: true,
    reclassifiable: true,
    withSnippet: true,
  },
  QUESTION: {
    label: "Questão",
    heading: false,
    inToc: false,
    approvesAs: "question",
    nodeKind: null,
    family: "questão",
    recognizesMath: true,
    reclassifiable: false,
    withSnippet: true,
  },
  ITEM: {
    label: "Item",
    heading: false,
    inToc: false,
    approvesAs: "folded",
    nodeKind: null,
    family: "item",
    recognizesMath: false,
    reclassifiable: false,
    withSnippet: true,
  },
  SUBITEM: {
    label: "Subitem",
    heading: false,
    inToc: false,
    approvesAs: "folded",
    nodeKind: null,
    family: "item",
    recognizesMath: false,
    reclassifiable: false,
    withSnippet: true,
  },
  FIGURE: {
    label: "Figura",
    heading: false,
    inToc: false,
    approvesAs: "body",
    nodeKind: null,
    family: "figura",
    recognizesMath: false,
    reclassifiable: false,
    withSnippet: false,
  },
  NOTE: {
    label: "Nota",
    heading: false,
    inToc: false,
    approvesAs: "body",
    nodeKind: null,
    family: "texto",
    recognizesMath: true,
    reclassifiable: true,
    withSnippet: false,
  },
};

/** Os tipos com um traço: é assim que cada passada monta o conjunto dela, a partir da tabela. */
export const kindsWhere = (test: (traits: ScanKindTraits) => boolean): ReadonlySet<ScanKind> =>
  new Set(SCAN_KINDS.filter((kind) => test(SCAN_KIND_TRAITS[kind])));

/** Os tipos que são título: a âncora deles é a linha do título, e o conteúdo vem nos filhos. */
export const HEADING_KINDS: ReadonlySet<ScanKind> = kindsWhere((traits) => traits.heading);

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
  /** Figuras com arquivo gravado (D58). Ausente quando a varredura correu sem recortar. */
  readonly figures?: number;
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

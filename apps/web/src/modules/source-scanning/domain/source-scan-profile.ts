import type { NormalizedBox } from "@modules/assets/domain/source-anchor";

/**
 * The scanner has a stable engine and swappable editorial profiles.
 *
 * A profile is intentionally NOT a shared infrastructure port. PDF storage, AI and math
 * recognition already have boundaries in the product. The profile only teaches the scanner how
 * a family of publications is structured and how to interpret its visual evidence.
 */
export type SourceDocumentKind = "BOOK" | "EXAM";

/** Richer than DocumentNode on purpose: this is a proposal vocabulary, before human review. */
export const SCAN_SEMANTIC_KINDS = [
  "BOOK",
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

export type ScanSemanticKind = (typeof SCAN_SEMANTIC_KINDS)[number];

export type ScanRegionRole = "PRIMARY" | "CONTINUATION" | "ILLUSTRATION" | "ANSWER";

/**
 * One semantic node can point to many pieces of the source.
 *
 * This is the crucial difference from a naive crop model: an exercise may start at the bottom of
 * page 41, continue at the top of page 42 and still be ONE exercise. Coordinates use the same
 * normalized 0..1 convention as SourceAnchor.
 */
export interface ScanRegion {
  readonly pageNumber: number;
  readonly box: NormalizedBox;
  readonly role: ScanRegionRole;
}

export interface ScanEvidence {
  readonly reason: string;
  readonly confidence: number;
}

export interface ScanNodeProposal {
  /** Temporary id used only while the proposal is being reviewed. */
  readonly proposalId: string;
  readonly parentProposalId: string | null;
  readonly kind: ScanSemanticKind;
  readonly title: string | null;
  readonly originalLabel: string | null;
  readonly regions: readonly ScanRegion[];
  readonly extractedText: string | null;
  readonly latex: string | null;
  readonly evidence: readonly ScanEvidence[];
  readonly confidence: number;
}

export interface ScanStructureProposal {
  readonly schemaVersion: 1;
  readonly profileId: string;
  readonly sourceAssetId: string;
  readonly nodes: readonly ScanNodeProposal[];
  readonly warnings: readonly string[];
}

/** Evidence available before asking a language/vision model anything. */
export interface HeadingEvidence {
  readonly text: string;
  readonly pageNumber: number;
  readonly fontSizeRatio?: number | null;
  readonly bold?: boolean | null;
  readonly centered?: boolean | null;
}

export interface HeadingClassification {
  readonly kind: ScanSemanticKind;
  readonly originalLabel: string | null;
  readonly confidence: number;
  readonly reason: string;
}

export interface SemanticPromptInput {
  readonly publicationTitle: string;
  readonly language: string | null;
  /** Compact page descriptions produced by the geometry/text pass, not raw PDF bytes. */
  readonly pages: readonly string[];
}

export interface SourceScanProfilePlugin {
  readonly id: string;
  readonly label: string;
  readonly documentKind: SourceDocumentKind;
  readonly semanticKinds: readonly ScanSemanticKind[];

  /** Fast, deterministic first pass. Unknown is valid; AI/review handles ambiguity. */
  classifyHeading(evidence: HeadingEvidence): HeadingClassification | null;

  /** Rules used by the proposal builder to reject impossible trees before showing them. */
  canContain(parent: ScanSemanticKind | null, child: ScanSemanticKind): boolean;

  /** Prompt for the existing AiProvider (local OpenAI-compatible endpoints work here). */
  buildSemanticPrompt(input: SemanticPromptInput): string;
}

const registry = new Map<string, SourceScanProfilePlugin>();

export function registerSourceScanProfile(plugin: SourceScanProfilePlugin): void {
  registry.set(plugin.id, plugin);
}

export const sourceScanProfile = (id: string): SourceScanProfilePlugin | null =>
  registry.get(id) ?? null;

export const registeredSourceScanProfiles = (): readonly SourceScanProfilePlugin[] => [
  ...registry.values(),
];

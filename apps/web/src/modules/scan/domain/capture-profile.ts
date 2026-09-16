import type { QuestionType } from "@modules/questions/domain/question-type";

import type { DocLine, ScanDocument } from "./document";
import type { PageModel, TextLine } from "./page";
import type { ConfidenceParts, Diagnostic, ProposedItem, ScanKind } from "./proposal";
import type { PublicationStyle } from "./typography";

/**
 * O perfil de captura: como um tipo de publicação é organizado (D41, D46).
 *
 * O motor sabe ler página, medir colunas, achar mobília e seguir a ordem de leitura. O perfil sabe
 * o que é um título, uma questão, um exercício, e quem pode conter quem. Separar os dois é o que
 * permite um `exam-vestibular-v1` ou um `worksheet-v1` sem reescrever o motor (§2 do prompt 03).
 *
 * Os oito campos da D41 estão em `settings` e `markers`; o comportamento que dado não expressa
 * vem em ganchos, e só o que o perfil precisa é obrigatório.
 */

export type AnswersLocation = "END_OF_BOOK" | "END_OF_CHAPTER" | "BELOW" | "NONE";

/**
 * Até onde vai um elemento:
 * - `heading` — só as linhas do título; o conteúdo vem nos filhos.
 * - `until-boundary` — da âncora até a próxima âncora que não seja descendente dele, ou até um
 *   limite semântico. É o caso geral da §12: coluna, página, várias páginas.
 * - `paragraph` — até o fim do parágrafo (vão maior que a entrelinha, ou recuo de parágrafo novo):
 *   o exemplo acaba e a teoria continua sem outro título no meio.
 */
export type Extent = "heading" | "until-boundary" | "paragraph";

export interface AnchorMatch {
  readonly kind: ScanKind;
  readonly label: string | null;
  readonly number: string | null;
  readonly title: string | null;
  readonly extent: Extent;
  /** Quantas linhas a âncora ocupa, a partir desta (um título em duas linhas ocupa duas). */
  readonly lines: number;
  readonly confidence: ConfidenceParts;
  readonly evidence: readonly string[];
  readonly metadata?: Readonly<Record<string, string | number>>;
  /**
   * Tipos abertos que esta âncora encerra antes de se encaixar, além do que `canContain` já
   * encerra — a questão 06 que vem depois do bloco de espanhol (01 a 05) não pertence a ele.
   */
  readonly closes?: readonly ScanKind[];
}

/** Um elemento aberto no caminho, visto pelo perfil. */
export interface OpenElement {
  readonly kind: ScanKind;
  readonly number: string | null;
  readonly anchor: DocLine;
  readonly metadata: Readonly<Record<string, string | number>>;
}

export interface WalkContext {
  readonly doc: ScanDocument;
  readonly style: PublicationStyle;
  readonly line: DocLine;
  /** A linha `offset` posições adiante na ordem de leitura. */
  peek(offset: number): DocLine | undefined;
  /** Os elementos abertos, do mais externo ao mais interno. */
  readonly open: readonly OpenElement[];
  /** O último irmão do tipo dado dentro do elemento aberto que o conteria. */
  lastSibling(kind: ScanKind): OpenElement | null;
  /** A margem esquerda da coluna desta linha. */
  readonly columnLeft: number;
  /** O que o perfil aprendeu do livro antes do caminho — ver `learnStyle`. */
  readonly learned: LearnedStyle;
}

/** Assinatura tipográfica → tipo, aprendida dos títulos que tinham padrão explícito (§18). */
export type LearnedStyle = ReadonlyMap<string, ScanKind>;

/** O elemento já montado, antes do estado de revisão — o que o perfil confere. */
export type DraftItem = Omit<ProposedItem, "reviewState" | "diagnostic"> & {
  readonly lines: readonly DocLine[];
};

export interface SemanticPromptInput {
  readonly profile: { readonly id: string; readonly label: string };
  readonly previousStructure: readonly { readonly kind: ScanKind; readonly label: string | null; readonly title: string | null }[];
  readonly candidates: readonly {
    readonly key: string;
    readonly kind: ScanKind;
    readonly text: string;
    readonly confidence: number;
    readonly reasons: readonly string[];
  }[];
  readonly allowedKinds: readonly ScanKind[];
}

export interface CaptureProfile {
  readonly id: string;
  readonly version: number;
  readonly label: string;
  readonly documentKind: "BOOK" | "EXAM";
  readonly description: string;
  readonly kinds: readonly ScanKind[];

  readonly settings: {
    readonly answersLocation: AnswersLocation;
    /** `auto` mede por página; um número força a expectativa (e vira evidência, não regra). */
    readonly columns: "auto" | number;
    readonly defaultQuestionType: QuestionType;
    /** `null` usa o modelo de visão do ambiente (`AI_VISION_MODEL`). */
    readonly visionModel: string | null;
    /** Texto corrido vira `CONTENT` (livro) ou é ignorado (prova)? */
    readonly emitContent: boolean;
    /** Confiança a partir da qual o item nasce `AUTO_ACCEPTABLE`, se o diagnóstico permitir. */
    readonly autoAcceptThreshold: number;
  };

  /** Os marcadores declarados (D41), para a tela e para a documentação do perfil. */
  readonly markers: {
    readonly questionStart: readonly RegExp[];
    readonly solution: readonly RegExp[];
    readonly headings: readonly RegExp[];
    readonly exerciseBlock: readonly RegExp[];
  };

  classifyLine(context: WalkContext): AnchorMatch | null;
  canContain(parent: ScanKind | null, child: ScanKind): boolean;

  /** Linha que nunca é mobília, ainda que se repita no mesmo lugar. */
  isProtected?(line: TextLine, style: PublicationStyle): boolean;
  /** Divisores de coluna a partir das linhas do documento inteiro. */
  columnHints?(lines: readonly TextLine[]): readonly number[];
  /** Linha que encerra os elementos abertos sem abrir outro (fim de área, "Respostas"). */
  isBoundary?(context: WalkContext): boolean;
  learnStyle?(lines: readonly DocLine[], style: PublicationStyle): LearnedStyle;
  validateItem?(item: DraftItem, doc: ScanDocument): Diagnostic | null;
  /** Substitui o caminho genérico — para perfis que já têm o próprio segmentador (`exam-v1`). */
  buildItems?(pages: readonly PageModel[]): readonly DraftItem[];
  buildSemanticPrompt(input: SemanticPromptInput): string;
}

const registry = new Map<string, CaptureProfile>();

/**
 * O registro. Um `Map` e três funções, como o dos tipos de questão: os perfis são registrados
 * explicitamente em `profiles/index.ts`, e ler aquele arquivo responde "quais perfis existem".
 */
export function registerCaptureProfile(profile: CaptureProfile): void {
  registry.set(profile.id, profile);
}

export const captureProfile = (id: string): CaptureProfile | null => registry.get(id) ?? null;

export const registeredCaptureProfiles = (): readonly CaptureProfile[] => [...registry.values()];

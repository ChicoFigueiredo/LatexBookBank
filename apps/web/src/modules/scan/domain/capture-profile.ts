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

/**
 * O que um perfil enxerga numa amostra, de 0 a 1, com a razão por escrito.
 *
 * A razão é metade do valor: "12 linhas QUESTÃO N, em duas colunas" deixa a pessoa conferir o
 * palpite em um segundo, e um número sozinho não deixa.
 */
export interface ProfileScore {
  readonly score: number;
  readonly evidence: string;
}

/**
 * Até onde vai um elemento:
 * - `heading` — só as linhas do título; o conteúdo vem nos filhos.
 * - `until-boundary` — da âncora até a próxima âncora que não seja descendente dele, ou até um
 *   limite semântico. É o caso geral da §12: coluna, página, várias páginas.
 * - `paragraph` — até o fim do parágrafo (vão maior que a entrelinha, ou recuo de parágrafo novo):
 *   o texto acaba e a teoria continua sem outro título no meio.
 * - `block` — vários parágrafos, até o **vão grande** que o livro abre depois do bloco. É o
 *   exemplo com a resolução junto (D56): o recuo de parágrafo novo não o fecha, porque a
 *   resolução é um parágrafo novo dentro dele; o espaço extra que o ambiente deixa, sim. É o
 *   mesmo sinal que o olho usa para ver onde o exemplo termina.
 */
export type Extent = "heading" | "until-boundary" | "paragraph" | "block";

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

  /**
   * A configuração que o motor **lê** ([ADR 0007](../../../../docs/adr/0007-o-perfil-de-captura-e-codigo.md)).
   *
   * A D41 dizia que um perfil declara oito coisas. Um ano de uso depois, sete delas nunca foram
   * lidas por ninguém: marcadores, número de colunas, modelo de visão e onde ficam as respostas
   * estavam preenchidos nos três perfis e consumidos por nenhum. Quem decide o scan são os
   * ganchos logo abaixo. Um campo volta aqui quando tiver consumidor, não antes.
   */
  readonly settings: {
    readonly defaultQuestionType: QuestionType;
    /** Texto corrido vira `CONTENT` (livro) ou é ignorado (prova)? */
    readonly emitContent: boolean;
    /** Confiança a partir da qual o item nasce `AUTO_ACCEPTABLE`, se o diagnóstico permitir. */
    readonly autoAcceptThreshold: number;
  };

  classifyLine(context: WalkContext): AnchorMatch | null;
  canContain(parent: ScanKind | null, child: ScanKind): boolean;

  /**
   * Quanto este perfil reconhece de uma amostra do documento (ADR 0007).
   *
   * Serve a duas perguntas que eram a mesma o tempo todo: **antes**, qual perfil sugerir para
   * este PDF; **depois**, se o perfil escolhido foi o errado. Quem sabe reconhecer "QUESTÃO N em
   * duas colunas" é o próprio `exam-enem-v1`, não um detector central que precisaria ser editado
   * a cada perfil novo. Obrigatório: gancho sem dono foi o que este ADR acabou de apagar.
   */
  score(sample: readonly PageModel[]): ProfileScore;

  /**
   * Linha que nunca é mobília — e que a figura nunca engole.
   *
   * As duas leituras são a mesma afirmação: esta linha é estrutura do documento. Ver a
   * proteção em `findFigures`, que nasceu de "QUESTÃO 45" sumindo dentro de um gráfico.
   */
  isProtected?(line: TextLine, style: PublicationStyle): boolean;
  /** Divisores de coluna a partir das linhas do documento inteiro. */
  columnHints?(lines: readonly TextLine[]): readonly number[];
  learnStyle?(lines: readonly DocLine[], style: PublicationStyle): LearnedStyle;
  validateItem?(item: DraftItem, doc: ScanDocument): Diagnostic | null;
  /** Substitui o caminho genérico — para perfis que já têm o próprio segmentador (`exam-v1`). */
  buildItems?(pages: readonly PageModel[]): readonly DraftItem[];
  buildSemanticPrompt(input: SemanticPromptInput): string;
}

/**
 * O retrato de um perfil no dia da varredura (ADR 0008).
 *
 * Perfil é código, e código sai. O que a proposta precisa **depois** que ele sai não é o perfil
 * vivo — é este punhado de dados: o rótulo que a tela mostra, os tipos que os seletores listam e
 * o tipo padrão com que a aprovação cria questão. O que **não** cabe aqui é comportamento:
 * `classifyLine` e `canContain` são código, não dado, e por isso editar a proposta continua
 * exigindo o perfil registrado.
 */
export interface CaptureProfileSnapshot {
  readonly label: string;
  readonly kinds: readonly ScanKind[];
  readonly defaultQuestionType: QuestionType;
}

export const snapshotOf = (profile: CaptureProfile): CaptureProfileSnapshot => ({
  label: profile.label,
  kinds: profile.kinds,
  defaultQuestionType: profile.settings.defaultQuestionType,
});

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

/** Um perfil, e o que ele enxergou da amostra. */
export interface RankedProfile {
  readonly id: string;
  readonly label: string;
  readonly documentKind: CaptureProfile["documentKind"];
  readonly score: number;
  readonly evidence: string;
}

/**
 * Os perfis registrados, do que mais reconhece a amostra ao que menos (ADR 0007).
 *
 * Uma função, duas perguntas. **Antes** da varredura, a amostra são as primeiras páginas do PDF
 * e o primeiro da lista é a sugestão. **Depois**, a amostra são as páginas que a execução leu, e
 * um primeiro colocado que não é o perfil escolhido é o aviso de que se varreu com o errado.
 */
export function rankProfiles(sample: readonly PageModel[]): readonly RankedProfile[] {
  return registeredCaptureProfiles()
    .map((profile) => {
      const { score, evidence } = profile.score(sample);
      return {
        id: profile.id,
        label: profile.label,
        documentKind: profile.documentKind,
        score: Math.min(1, Math.max(0, score)),
        evidence,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * A distância a partir da qual vale interromper alguém com "você escolheu o perfil errado".
 *
 * Generosa de propósito: um aviso que aparece à toa ensina a ignorar avisos, e o livro-texto com
 * uma prova no fim do volume pontua nos dois perfis sem que nenhum esteja errado.
 */
export const PROFILE_MISMATCH_MARGIN = 0.25;

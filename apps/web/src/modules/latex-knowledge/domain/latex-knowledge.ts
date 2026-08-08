/**
 * O conhecimento LaTeX como domínio próprio.
 *
 * Estes tipos são o alvo do importador (Fase 4) **e** a fonte do completion provider e da palette
 * de símbolos. Nenhum deles menciona `monaco-editor` nem Prisma: o legado enche as estruturas, a
 * UI as adapta, e nenhum dos dois lados conhece o outro.
 */

/** Um item de autocomplete: o que o usuário digita, o que é inserido, o que ele lê antes. */
export interface LatexSnippet {
  /** Palavra que dispara a sugestão, sem a barra (`alpha`, não `\alpha`). */
  readonly trigger: string;
  /** Rótulo mostrado na lista — a forma legível do comando, com os argumentos. */
  readonly label: string;
  /** Corpo no formato do Monaco, já com `${1:nome}`. */
  readonly body: string;
  /** Texto de apoio; vazio no legado na maioria das linhas. */
  readonly documentation: string | null;
  /** Prioridade legada (`PrimaryPriority`); ordena empates na lista. */
  readonly priority: number;
  /** `true` quando o corpo tem ao menos um ponto de parada. */
  readonly hasPlaceholders: boolean;
  readonly legacyId: number;
}

/** Um grupo da palette: `greek`, `arrows`, `operators`… */
export interface LatexSymbolGroup {
  readonly name: string;
  readonly sortOrder: number;
  readonly legacyId: number;
}

/** Um símbolo da palette. */
export interface LatexSymbol {
  readonly groupName: string;
  readonly command: string;
  /**
   * O caractere Unicode equivalente, quando existe.
   *
   * Existe para 867 dos 2.741 — o resto é comando sem representação direta (`\frac`, ícones de
   * pacote). Por isso a palette precisa do SVG como segunda opção, não como enfeite.
   */
  readonly unicode: string | null;
  /** Pacote exigido; string vazia no legado vira `null`. */
  readonly requiredPackage: string | null;
  /** `true` quando o símbolo só é válido em modo matemático. */
  readonly mathMode: boolean;
  /**
   * Miniatura em SVG.
   *
   * SVG é **markup, não binário** — por isso pode viver no banco sem ferir a auditoria §8, ao
   * contrário do `PNGSimbol` do legado, que fica de fora. Ainda assim é conteúdo de terceiro:
   * quem renderizar precisa sanitizar.
   */
  readonly previewSvg: string | null;
  readonly sortOrder: number;
  readonly legacyId: number;
}

/** Um botão do ribbon legado — template pronto para inserir, com atalho opcional. */
export interface LatexIconMenu {
  readonly groupName: string;
  readonly subGroupName: string;
  readonly name: string;
  readonly template: string;
  readonly shortcut: string | null;
  readonly sortOrder: number;
  readonly legacyId: number;
}

/** Tudo que o `LatexMetadata.db` tem a dizer, já traduzido para o domínio. */
export interface LatexKnowledge {
  readonly snippets: readonly LatexSnippet[];
  readonly symbolGroups: readonly LatexSymbolGroup[];
  readonly symbols: readonly LatexSymbol[];
  readonly iconMenus: readonly LatexIconMenu[];
}

/**
 * Linhas que existem no legado mas não viraram domínio.
 *
 * Não é detalhe de log: o levantamento diz **29 menus de ícones**, e o import grava 28 porque um
 * deles (`Asteristic`, id 8) tem o template nulo. Sem este campo, a diferença apareceria como um
 * número que não bate com o levantamento e ninguém saberia dizer se foi bug ou dado torto.
 */
export interface SkippedRows {
  /** Sem gatilho ou sem template — não há o que sugerir. */
  readonly snippets: number;
  /** Aponta para um grupo que não existe. */
  readonly symbols: number;
  /** Sem template LaTeX — o botão não teria o que inserir. */
  readonly iconMenus: number;
}

export interface LegacyReadResult {
  readonly knowledge: LatexKnowledge;
  /** Quantas linhas cada tabela do legado tinha, antes de qualquer descarte. */
  readonly sourceCounts: LatexKnowledgeCounts;
  readonly skipped: SkippedRows;
}

/**
 * Porta de leitura do banco legado.
 *
 * Só tem `read`: o legado é patrimônio e é aberto **estritamente read-only**. Uma interface sem
 * método de escrita é a forma mais barata de garantir isso — não há o que chamar por engano.
 */
export interface LegacyLatexMetadataReader {
  read(): Promise<LegacyReadResult>;
}

/** Porta de escrita do conhecimento no banco do produto. */
export interface LatexKnowledgeRepository {
  replaceAll(knowledge: LatexKnowledge): Promise<LatexKnowledgeCounts>;
}

export interface LatexKnowledgeCounts {
  readonly snippets: number;
  readonly symbolGroups: number;
  readonly symbols: number;
  readonly iconMenus: number;
}

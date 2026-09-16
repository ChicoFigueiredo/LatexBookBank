import type { LegacyCapabilities } from "./legacy-schema";

/**
 * Forma bruta de uma linha de `Questao`, com os nomes reais confirmados contra o acervo
 * (levantamento de 2026-08-31). Os campos de banca só existem quando `capabilities.hasBanca`.
 */
export interface RawLegacyQuestionRow {
  readonly IdQuestao: number;
  readonly IdQuestao_Pai: number | null;
  readonly TipoQuestao: number;
  /** Elo com `Publication` — o livro de verdade dentro da biblioteca. */
  readonly idPublication: number;
  readonly Apelido: string | null;
  readonly latexQuestao: string | null;
  readonly latexResposta: string | null;
  readonly latexOrigin: string | null;
  readonly latexComplemento?: string | null;
  readonly Dificuldade: number | null;
  readonly Numeracao: number | null;
  readonly Numeracao_Original: number | null;
  readonly Banca?: string | null;
  readonly ["Instituição"]?: string | null;
  readonly Cargo?: string | null;
  readonly Nivel_Cargo?: string | null;
  readonly Ano: number | null;
}

/** `Questao_Itens` não varia por biblioteca — mesma forma nas quatro checadas. */
export interface RawLegacyOptionRow {
  readonly IdQuestao_Itens: number;
  readonly IdQuestao: number;
  readonly Ordem: number;
  readonly Marcacao: string | null;
  readonly Correta: number;
  readonly latexOrigin: string | null;
  readonly latexItem: string | null;
  readonly latexResposta: string | null;
}

/**
 * Uma linha de `Publication` — o livro de verdade (com ISBN, capa, UUID) dentro da biblioteca.
 * Colunas confirmadas idênticas em três bibliotecas de formas diferentes (2026-08-31); nenhuma
 * variação por capacidade observada, diferente de `Questao`.
 */
export interface RawLegacyPublicationRow {
  readonly idPublication: number;
  readonly PublicationName: string | null;
  readonly UUID: string | null;
  readonly ISBN: string | null;
  readonly AuthorSort: string | null;
  readonly PublicationNick: string | null;
  readonly PublicationSeries: string | null;
  readonly Notes: string | null;
}

export interface LegacyLibraryContents {
  readonly capabilities: LegacyCapabilities;
  readonly publications: readonly RawLegacyPublicationRow[];
  readonly questions: readonly RawLegacyQuestionRow[];
  readonly options: readonly RawLegacyOptionRow[];
}

export interface LegacyLibraryReader {
  read(): Promise<LegacyLibraryContents>;
}

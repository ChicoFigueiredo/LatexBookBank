import type { LegacyCapabilities } from "./legacy-schema";

/**
 * Forma bruta de uma linha de `Questao`, com os nomes reais confirmados contra o acervo
 * (levantamento de 2026-08-31). Os campos de banca só existem quando `capabilities.hasBanca`.
 */
export interface RawLegacyQuestionRow {
  readonly IdQuestao: number;
  readonly IdQuestao_Pai: number | null;
  readonly TipoQuestao: number;
  readonly Apelido: string | null;
  readonly latexQuestao: string | null;
  readonly latexResposta: string | null;
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

export interface LegacyLibraryContents {
  readonly capabilities: LegacyCapabilities;
  readonly questions: readonly RawLegacyQuestionRow[];
  readonly options: readonly RawLegacyOptionRow[];
}

export interface LegacyLibraryReader {
  read(): Promise<LegacyLibraryContents>;
}

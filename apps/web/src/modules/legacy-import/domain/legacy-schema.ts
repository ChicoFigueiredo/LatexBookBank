/**
 * As três gerações de schema do acervo legado.
 *
 * As treze bibliotecas **não** estão na mesma versão: dez têm a migração
 * `add_LatexComplemento`, duas pararam em `Questao_Imagens_Completa` e sem `TagConhecimento`, e
 * duas não têm sequer a tabela `__EFMigrationsHistory`. Um leitor que assumisse forma única
 * quebraria em três bibliotecas — e quebraria **na leitura**, com a mensagem errada: "coluna não
 * existe" parece defeito do importador, não deriva do acervo.
 *
 * A saída daqui não é "qual versão", é **quais campos existem**. Versão é um detalhe do
 * histórico; o que o mapper precisa saber é se pode ler `LatexComplemento`.
 *
 * Ver planejamento §2.4 · issue #111.
 */

export const SCHEMA_GENERATIONS = [
  "latex_complemento",
  "imagens_completa",
  "pre_migrations",
] as const;
export type SchemaGeneration = (typeof SCHEMA_GENERATIONS)[number];

export interface LegacyCapabilities {
  readonly generation: SchemaGeneration;
  /** `Questao.latexComplemento` — o terceiro campo de texto da questão. */
  readonly hasComplemento: boolean;
  /** Tabela `TagConhecimento`, ausente na geração intermediária. */
  readonly hasTagConhecimento: boolean;
  /**
   * `Questao.Banca` (e `Instituição`/`Cargo`/`Nivel_Cargo` junto). Presente nas bibliotecas de
   * banca de concurso (Cesgranrio, Análise Elon), ausente nas de livro-texto (Cálculo, ProfMat) —
   * **não** é a mesma coisa que geração: o ProfMat real tem a migração mais recente sem ter banca.
   * Ver levantamento de 2026-08-31 contra as 11 bibliotecas reais.
   */
  readonly hasBanca: boolean;
  /** `__EFMigrationsHistory`, ausente nas duas bibliotecas mais antigas. */
  readonly hasMigrationsTable: boolean;
}

const LATEX_COMPLEMENTO = "20240317152417_add_LatexComplemento";
const IMAGENS_COMPLETA = "20221124021733_Questao_Imagens_Completa";

export interface SchemaProbe {
  /** Ids de `__EFMigrationsHistory`, ou `null` quando a tabela não existe. */
  readonly migrations: readonly string[] | null;
  /** Nomes de tabela presentes no banco. */
  readonly tables: readonly string[];
  /** Colunas de `Questao`. */
  readonly questionColumns: readonly string[];
}

/**
 * Decide a geração e as capacidades a partir do que o banco de fato tem.
 *
 * A migração é usada como **pista**, não como verdade: as duas bibliotecas sem
 * `__EFMigrationsHistory` provam que o histórico pode não existir, e uma biblioteca restaurada de
 * backup pode ter a linha de migração sem a coluna. Perguntar ao schema é sempre mais barato que
 * confiar num registro sobre o schema.
 */
export function detectCapabilities(probe: SchemaProbe): LegacyCapabilities {
  const hasMigrationsTable = probe.migrations !== null;
  const migrations = probe.migrations ?? [];

  // A coluna manda. A migração só decide quando as colunas não desempatam.
  const hasComplemento =
    probe.questionColumns.includes("latexComplemento") ||
    (probe.questionColumns.length === 0 && migrations.includes(LATEX_COMPLEMENTO));

  const hasTagConhecimento = probe.tables.includes("TagConhecimento");

  // Independente da geração: o ProfMat real prova que dá para ter a migração mais recente sem ter
  // banca de concurso (é biblioteca de livro-texto). Só a coluna decide.
  const hasBanca = probe.questionColumns.includes("Banca");

  const generation: SchemaGeneration = !hasMigrationsTable
    ? "pre_migrations"
    : hasComplemento || migrations.includes(LATEX_COMPLEMENTO)
      ? "latex_complemento"
      : migrations.includes(IMAGENS_COMPLETA)
        ? "imagens_completa"
        : // Histórico com migração desconhecida: tratar como a mais antiga é o que degrada sem
          // quebrar — ler menos campos nunca corrompe, ler campos que não existem sim.
          "pre_migrations";

  return { generation, hasComplemento, hasTagConhecimento, hasBanca, hasMigrationsTable };
}

/**
 * As colunas de `Questao` que a leitura pode pedir, dada a geração.
 *
 * Montada aqui e não no SQL para que o `SELECT` nunca cite coluna ausente. Um `SELECT *` evitaria
 * o problema e criaria outro: a forma da linha passaria a depender da biblioteca, e o mapper
 * teria de adivinhar o que recebeu.
 */
export function questionColumnsFor(capabilities: LegacyCapabilities): readonly string[] {
  return [
    "IdQuestao",
    "IdQuestao_Pai",
    "TipoQuestao",
    // O elo com a tabela `Publication` — o livro de verdade dentro da biblioteca. Uma subárvore
    // inteira (raiz e todos os descendentes) pertence a um único `idPublication`, confirmado por
    // consulta recursiva nas bibliotecas reais em 2026-08-31.
    "idPublication",
    // Não existe `Titulo` no schema real — `Apelido` é o campo com o rótulo (confirmado contra as
    // 11 bibliotecas em 2026-08-31; um `SELECT Titulo` teria falhado na primeira execução real).
    "Apelido",
    "latexQuestao",
    "latexResposta",
    "latexOrigin",
    ...(capabilities.hasComplemento ? ["latexComplemento"] : []),
    "Dificuldade",
    "Numeracao",
    "Numeracao_Original",
    // `Instituição` (com acento) e `Nivel_Cargo` (com underscore) — não `Instituicao`/`NivelCargo`.
    // Só entram quando a biblioteca é de banca de concurso; livro-texto não tem essas colunas.
    ...(capabilities.hasBanca ? ["Banca", "Instituição", "Cargo", "Nivel_Cargo"] : []),
    "Ano",
    // `Ordem` **não** entra: ela vale 0 em praticamente todas as linhas, e um `SELECT` que a traz
    // convida alguém a ordenar por ela um dia. A ordem vem de `IdQuestao` (planejamento §2.4).
    // `Correta` também não: é vestigial no nível da questão, e a verdade está em `Questao_Itens`.
    // `IsExpanded`, `IsSelected` e `IdQuestao_Original` são estado de UI e coluna morta.
  ];
}

/**
 * Colunas reais de `Questao` sem decisão de mapeamento — diferente de
 * `DELIBERATELY_IGNORED_COLUMNS`, que é "decidiu descartar". Lista vazia por enquanto: o
 * levantamento de 2026-08-31 contra as 11 bibliotecas reais checou `Nivel`, `Publicacao`, `Path`,
 * `VideoLink` e `Editora` (as cinco candidatas que sobravam) e não achou **nenhum** dado real —
 * `Editora` e `Publicacao` vazias em toda biblioteca checada, `Path`/`VideoLink` idem, e `Nivel`
 * bate exatamente com a profundidade da árvore (230 de 230 na Cesgranrio CAIXA) — redundante,
 * mesma razão de `Ordem` abaixo. As cinco entraram em `DELIBERATELY_IGNORED_COLUMNS`.
 *
 * Deixado como array (não removido) para o próximo leitor real ter onde registrar uma pendência
 * genuína, se aparecer.
 */
export const FIELDS_PENDING_MAPPING_DECISION: readonly string[] = [];

/** As colunas que existem no legado e que o import **descarta de propósito**, para o relatório. */
export const DELIBERATELY_IGNORED_COLUMNS: Readonly<Record<string, string>> = {
  Ordem: "vale 0 em praticamente todas as linhas; a ordem real é a de IdQuestao",
  Nivel: "bate exatamente com a profundidade da árvore (230 de 230 checadas) — redundante",
  Publicacao: "vazia em toda biblioteca checada (2026-08-31)",
  Path: "vazia em toda biblioteca checada (2026-08-31)",
  VideoLink: "vazia em toda biblioteca checada (2026-08-31)",
  Editora: "vazia em toda biblioteca checada (2026-08-31) — não é a editora da Publication",
  Correta: "vestigial no nível da questão — o gabarito está em Questao_Itens.Correta",
  IsExpanded: "estado de UI; no produto novo vive em localStorage",
  IsSelected: "estado de UI; no produto novo vive em localStorage",
  IdQuestao_Original: "zero linhas em todas as bibliotecas",
  imgOriginal: "zero BLOBs; as imagens estão no sistema de arquivos",
  imgGerada: "zero BLOBs; as imagens estão no sistema de arquivos",
};

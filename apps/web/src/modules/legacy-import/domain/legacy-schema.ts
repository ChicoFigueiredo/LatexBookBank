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
  /** `Questao.LatexComplemento` — o terceiro campo de texto da questão. */
  readonly hasComplemento: boolean;
  /** Tabela `TagConhecimento`, ausente na geração intermediária. */
  readonly hasTagConhecimento: boolean;
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
    probe.questionColumns.includes("LatexComplemento") ||
    (probe.questionColumns.length === 0 && migrations.includes(LATEX_COMPLEMENTO));

  const hasTagConhecimento = probe.tables.includes("TagConhecimento");

  const generation: SchemaGeneration = !hasMigrationsTable
    ? "pre_migrations"
    : hasComplemento || migrations.includes(LATEX_COMPLEMENTO)
      ? "latex_complemento"
      : migrations.includes(IMAGENS_COMPLETA)
        ? "imagens_completa"
        : // Histórico com migração desconhecida: tratar como a mais antiga é o que degrada sem
          // quebrar — ler menos campos nunca corrompe, ler campos que não existem sim.
          "pre_migrations";

  return { generation, hasComplemento, hasTagConhecimento, hasMigrationsTable };
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
    "Titulo",
    "LatexEnunciado",
    "LatexResposta",
    ...(capabilities.hasComplemento ? ["LatexComplemento"] : []),
    "Dificuldade",
    "Numeracao",
    "Numeracao_Original",
    "Banca",
    "Instituicao",
    "Cargo",
    "NivelCargo",
    "Ano",
    // `Ordem` **não** entra: ela vale 0 em praticamente todas as linhas, e um `SELECT` que a traz
    // convida alguém a ordenar por ela um dia. A ordem vem de `IdQuestao` (planejamento §2.4).
    // `Correta` também não: é vestigial no nível da questão, e a verdade está em `Questao_Itens`.
    // `IsExpanded`, `IsSelected` e `IdQuestao_Original` são estado de UI e coluna morta.
  ];
}

/** As colunas que existem no legado e que o import **descarta de propósito**, para o relatório. */
export const DELIBERATELY_IGNORED_COLUMNS: Readonly<Record<string, string>> = {
  Ordem: "vale 0 em praticamente todas as linhas; a ordem real é a de IdQuestao",
  Correta: "vestigial no nível da questão — o gabarito está em Questao_Itens.Correta",
  IsExpanded: "estado de UI; no produto novo vive em localStorage",
  IsSelected: "estado de UI; no produto novo vive em localStorage",
  IdQuestao_Original: "zero linhas em todas as bibliotecas",
  imgOriginal: "zero BLOBs; as imagens estão no sistema de arquivos",
  imgGerada: "zero BLOBs; as imagens estão no sistema de arquivos",
};

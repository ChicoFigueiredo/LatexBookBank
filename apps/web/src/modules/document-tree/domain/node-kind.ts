/**
 * Tipo de nó da árvore de conteúdo.
 *
 * O conector SQLite do Prisma não suporta `enum`, então a coluna é `String` e o vocabulário
 * fechado vive aqui. Manter assim mesmo depois do PostgreSQL é o que preserva domínio idêntico
 * nos dois motores — trocar por enum nativo criaria uma diferença que a Fase 6.5 teria de
 * reconciliar.
 */
export const NODE_KINDS = [
  "BOOK",
  "PART",
  "CHAPTER",
  "SECTION",
  "SUBSECTION",
  "CONTENT",
  "QUESTION_GROUP",
  "QUESTION",
  "FIGURE",
  "NOTE",
] as const;

export type NodeKind = (typeof NODE_KINDS)[number];

export const isNodeKind = (value: string): value is NodeKind =>
  (NODE_KINDS as readonly string[]).includes(value);

/** Estilo de numeração. Vem de `Questoes_Numeracao` legado (0 · 13 · 27). */
export const NUMBERING_STYLES = ["ARABIC", "ROMAN", "LETTER"] as const;

export type NumberingStyle = (typeof NUMBERING_STYLES)[number];

export const isNumberingStyle = (value: string): value is NumberingStyle =>
  (NUMBERING_STYLES as readonly string[]).includes(value);

/**
 * Mapa do `TipoQuestao` legado para `NodeKind`.
 *
 * No legado, nós estruturais e questões dividiam a tabela `Questao`, distinguidos pelo **sinal**
 * de `TipoQuestao`: negativos são estrutura, positivos são questão.
 */
export const LEGACY_TIPO_QUESTAO_TO_NODE_KIND: Readonly<Record<number, NodeKind>> = {
  [-10]: "CHAPTER",
  [-9]: "SECTION",
  [-8]: "SUBSECTION",
  [-7]: "SUBSECTION",
  [-1]: "QUESTION_GROUP",
};

export const nodeKindFromLegacy = (tipoQuestao: number): NodeKind =>
  tipoQuestao < 0 ? (LEGACY_TIPO_QUESTAO_TO_NODE_KIND[tipoQuestao] ?? "CONTENT") : "QUESTION";

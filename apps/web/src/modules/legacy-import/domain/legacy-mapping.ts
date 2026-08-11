import { generateNKeysBetween } from "@modules/document-tree/domain/fractional-index";
import type { NodeKind } from "@modules/document-tree/domain/node-kind";
import {
  isDifficulty,
  LEGACY_TIPO_QUESTAO_TO_TYPE,
  type Difficulty,
  type QuestionType,
} from "@modules/questions/domain/question-type";

/**
 * O mapeamento do acervo legado.
 *
 * Duas decisões carregam o resto:
 *
 * 1. **O sinal de `TipoQuestao` separa estrutura de questão.** No legado, capítulo e questão
 *    dividem a mesma tabela, distinguidos por negativo e positivo. Não é elegante, mas é o dado
 *    real — e traduzi-lo aqui é o que permite o resto do produto nunca saber disso.
 *
 * 2. **`Ordem` é ignorada.** Ela vale `0` em praticamente todas as linhas, e há um pai com 59
 *    filhos todos em zero. Um importador que confiasse nela embaralharia o acervo inteiro **em
 *    silêncio** — que é o pior modo de falha possível num import que roda uma vez. A ordem real é
 *    a de inserção, ou seja, `IdQuestao`.
 *
 * Ver planejamento §2.4 · §6 · issue #111.
 */

/** Negativos são estrutura. A tabela vem do levantamento, com as ocorrências reais. */
const STRUCTURAL_KINDS: Readonly<Record<number, NodeKind>> = {
  [-10]: "CHAPTER",
  [-9]: "SECTION",
  [-8]: "SUBSECTION",
  // `-7` (SubSubSeção) não tem linhas no acervo, mas existe no vocabulário. Vira `SUBSECTION`
  // porque a profundidade quem dá é a árvore, não o rótulo — e um `SUBSUBSECTION` no schema novo
  // seria um tipo que só existe para espelhar um nível que ninguém usou.
  [-7]: "SUBSECTION",
  [-1]: "QUESTION_GROUP",
};

export interface LegacyNodeClassification {
  readonly kind: NodeKind;
  /** Presente só quando o nó é questão. */
  readonly questionType: QuestionType | null;
}

export class UnknownTipoQuestaoError extends Error {
  constructor(readonly tipoQuestao: number) {
    super(
      `\`TipoQuestao\` ${tipoQuestao} não está no vocabulário do legado. ` +
        "O import para aqui em vez de descartar a linha.",
    );
    this.name = "UnknownTipoQuestaoError";
  }
}

/**
 * Classifica um nó do legado.
 *
 * Tipo desconhecido **falha**, não vira um default. Uma linha descartada em silêncio é uma questão
 * que some do acervo sem ninguém notar, e o import roda uma vez — não há segunda chance de
 * perceber.
 */
export function classifyNode(tipoQuestao: number): LegacyNodeClassification {
  if (tipoQuestao < 0) {
    const kind = STRUCTURAL_KINDS[tipoQuestao];
    if (kind === undefined) throw new UnknownTipoQuestaoError(tipoQuestao);
    return { kind, questionType: null };
  }

  const questionType = LEGACY_TIPO_QUESTAO_TO_TYPE[tipoQuestao];
  if (questionType === undefined) throw new UnknownTipoQuestaoError(tipoQuestao);

  return { kind: "QUESTION", questionType };
}

/** `Questoes_Numeracao`: 0 indo-arábica, 13 romana, 27 letras. */
const NUMBERING: Readonly<Record<number, "ARABIC" | "ROMAN" | "LETTER">> = {
  0: "ARABIC",
  13: "ROMAN",
  27: "LETTER",
};

/** Valor fora da tabela cai em arábica — é o default do legado e não perde informação. */
export const mapNumbering = (value: number | null): "ARABIC" | "ROMAN" | "LETTER" =>
  NUMBERING[value ?? 0] ?? "ARABIC";

/**
 * `Dificuldade` na escala legada: 0 · 2 · 5 · 7 · 10.
 *
 * Não é 1–5. Um valor fora da escala vira o meio — e isso **é** perda, então quem chama registra
 * no relatório. Falhar seria pior: uma dificuldade estranha não invalida a questão.
 */
export function mapDifficulty(value: number | null): { difficulty: Difficulty; coerced: boolean } {
  if (value !== null && isDifficulty(value)) return { difficulty: value, coerced: false };
  return { difficulty: 5, coerced: true };
}

export interface LegacyRow {
  readonly IdQuestao: number;
  readonly IdQuestao_Pai: number | null;
}

/**
 * A ordem dos irmãos, e as `sortKey` que saem dela.
 *
 * Por `IdQuestao` crescente — a ordem de inserção —, e **nunca** por `Ordem`. As chaves são
 * geradas de uma vez para todo o grupo de irmãos: gerar uma a uma, inserindo sempre no fim,
 * produziria chaves cada vez mais longas sem necessidade.
 */
export function siblingOrder<T extends LegacyRow>(
  rows: readonly T[],
): ReadonlyMap<number | null, readonly { row: T; sortKey: string }[]> {
  const byParent = new Map<number | null, T[]>();

  for (const row of rows) {
    const parent = row.IdQuestao_Pai;
    const siblings = byParent.get(parent) ?? [];
    siblings.push(row);
    byParent.set(parent, siblings);
  }

  const result = new Map<number | null, { row: T; sortKey: string }[]>();

  for (const [parent, siblings] of byParent) {
    const ordered = [...siblings].sort((a, b) => a.IdQuestao - b.IdQuestao);
    const keys = generateNKeysBetween(null, null, ordered.length);

    result.set(
      parent,
      ordered.map((row, index) => ({ row, sortKey: keys[index] as string })),
    );
  }

  return result;
}

/* ───────────────────────────── fontes de figura ───────────────────────────── */

/**
 * Classificação de asset por extensão.
 *
 * O acervo tem 318 `gnuplot`, 316 `.table`, 227 `.tex`, 211 EPS, 169 PGF, 127 SVG, 48 GeoGebra,
 * 32 Asymptote, 25 TpX. São **fontes de figura**, não imagens finais: guardá-las como anexo
 * genérico perderia a informação de que existe um gerador — que é justamente o que permite
 * recompilar a figura depois.
 */
export const FIGURE_SOURCE_KINDS: Readonly<Record<string, string>> = {
  ".gnuplot": "FIGURE_SOURCE_GNUPLOT",
  ".table": "FIGURE_SOURCE_GNUPLOT_DATA",
  ".pgf": "FIGURE_SOURCE_PGF",
  ".asy": "FIGURE_SOURCE_ASYMPTOTE",
  ".ggb": "FIGURE_SOURCE_GEOGEBRA",
  ".tpx": "FIGURE_SOURCE_TPX",
  ".tex": "FIGURE_SOURCE_TEX",
  ".svg": "FIGURE_SOURCE_SVG",
  ".eps": "FIGURE_SOURCE_EPS",
  ".fig": "FIGURE_SOURCE_XFIG",
};

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

export interface AssetClassification {
  readonly kind: string;
  /** `true` quando o arquivo não foi reconhecido e caiu em `ATTACHMENT`. */
  readonly unclassified: boolean;
}

/**
 * Classifica um arquivo do acervo.
 *
 * `preview.png` **não** é importado: é cache de render, e trazê-lo faria o produto novo carregar
 * imagens que ele mesmo sabe regenerar — desatualizadas na primeira edição.
 *
 * O que não é reconhecido vira `ATTACHMENT` e **é reportado**. Nenhum arquivo é descartado em
 * silêncio: um `.knd` que ninguém previu precisa aparecer no relatório para virar decisão, não
 * sumir por falta de `case`.
 */
export function classifyAsset(path: string): AssetClassification | null {
  const name = path.split("/").pop() ?? path;
  const lower = name.toLowerCase();

  if (lower === "preview.png") return null;
  if (lower === "cover.jpg" || lower === "cover.jpeg") {
    return { kind: "COVER", unclassified: false };
  }
  if (lower.endsWith(".detail.json")) return { kind: "PUBLICATION_METADATA", unclassified: false };

  const dot = lower.lastIndexOf(".");
  const extension = dot === -1 ? "" : lower.slice(dot);

  const figureKind = FIGURE_SOURCE_KINDS[extension];
  if (figureKind !== undefined) return { kind: figureKind, unclassified: false };

  if (extension === ".pdf") return { kind: "SOURCE_PDF", unclassified: false };
  if (IMAGE_EXTENSIONS.has(extension)) return { kind: "IMAGE", unclassified: false };

  return { kind: "ATTACHMENT", unclassified: true };
}

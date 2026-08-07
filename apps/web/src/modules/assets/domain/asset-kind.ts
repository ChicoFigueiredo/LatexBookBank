/**
 * Tipos de Asset.
 *
 * A separação entre **fonte** e **derivado** não é cosmética: elas têm políticas de retenção
 * diferentes (D29). Fonte é patrimônio editorial e imutável — arquivo alterado gera um Asset
 * novo, nunca sobrescrita. Derivado é reconstruível e pode ser descartado a qualquer momento.
 *
 * A lista de `FIGURE_SOURCE_*` veio do inventário do acervo real, não da spec: existem 318
 * scripts gnuplot, 169 PGF, 48 GeoGebra, 32 Asymptote e 25 TpX. Sem esses tipos, mil arquivos
 * entrariam como blob anônimo e a capacidade de reeditar uma figura na origem se perderia.
 */

/** Patrimônio: preservado permanentemente, tratado como imutável. */
export const SOURCE_ASSET_KINDS = [
  "SOURCE_PDF",
  "SOURCE_IMAGE",
  "QUESTION_IMAGE",
  "CROP",
  "COVER",
  "FIGURE_SOURCE_GNUPLOT",
  "FIGURE_SOURCE_PGF",
  "FIGURE_SOURCE_ASYMPTOTE",
  "FIGURE_SOURCE_GEOGEBRA",
  "FIGURE_SOURCE_TPX",
  "FIGURE_SOURCE_TEX",
  "FIGURE_SOURCE_SVG",
  "FIGURE_SOURCE_EPS",
  "FIGURE_DATA_TABLE",
  "ATTACHMENT",
] as const;

/** Reconstruível: pode ser descartado e regerado pelo renderer. */
export const DERIVED_ASSET_KINDS = ["RENDER_PDF", "RENDER_PNG", "RENDER_SVG"] as const;

export const ASSET_KINDS = [...SOURCE_ASSET_KINDS, ...DERIVED_ASSET_KINDS] as const;

export type SourceAssetKind = (typeof SOURCE_ASSET_KINDS)[number];
export type DerivedAssetKind = (typeof DERIVED_ASSET_KINDS)[number];
export type AssetKind = (typeof ASSET_KINDS)[number];

export const isAssetKind = (value: string): value is AssetKind =>
  (ASSET_KINDS as readonly string[]).includes(value);

/** Fonte é patrimônio: nunca apagar por rotina de limpeza. */
export const isSourceAsset = (kind: AssetKind): kind is SourceAssetKind =>
  (SOURCE_ASSET_KINDS as readonly string[]).includes(kind);

/** Derivado é cache: pode ser apagado e reconstruído. */
export const isDerivedAsset = (kind: AssetKind): kind is DerivedAssetKind =>
  (DERIVED_ASSET_KINDS as readonly string[]).includes(kind);

/**
 * Classificação por extensão, usada pelo importador legado (Fase 11).
 *
 * O que não casar cai em `ATTACHMENT` — e o relatório de import precisa dizer o que caiu ali,
 * para que nenhum arquivo seja descartado em silêncio.
 */
export const EXTENSION_TO_ASSET_KIND: Readonly<Record<string, AssetKind>> = {
  pdf: "SOURCE_PDF",
  png: "SOURCE_IMAGE",
  jpg: "SOURCE_IMAGE",
  jpeg: "SOURCE_IMAGE",
  gnuplot: "FIGURE_SOURCE_GNUPLOT",
  gp: "FIGURE_SOURCE_GNUPLOT",
  pgf: "FIGURE_SOURCE_PGF",
  asy: "FIGURE_SOURCE_ASYMPTOTE",
  ggb: "FIGURE_SOURCE_GEOGEBRA",
  tpx: "FIGURE_SOURCE_TPX",
  tex: "FIGURE_SOURCE_TEX",
  svg: "FIGURE_SOURCE_SVG",
  eps: "FIGURE_SOURCE_EPS",
  table: "FIGURE_DATA_TABLE",
};

export const assetKindFromExtension = (filename: string): AssetKind => {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TO_ASSET_KIND[extension] ?? "ATTACHMENT";
};

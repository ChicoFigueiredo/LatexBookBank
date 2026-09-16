import { isAssetKind, isSourceAsset } from "@modules/assets/domain/asset-kind";
import { assetLatexName, type AssetForLatex } from "@modules/assets/domain/asset-latex-name";

/**
 * Quais dos assets de uma questão o corpo compilado **cita** — e por que nome.
 *
 * É a regra que `loadQuestionAssets` aplica antes de tocar no storage, separada dele para que
 * dê para afirmá-la sem banco: "este LaTeX, com estes assets, leva estes arquivos no bundle". O
 * import do legado depende disso — a figura reescrita só viaja se o nome que ele gravou no
 * enunciado for exatamente o que esta função calcula.
 *
 * Derivado nunca entra: `RENDER_PNG` é saída de compilação, e reenviá-lo como entrada seria
 * pedir ao worker que compilasse o próprio resultado.
 *
 * Ver spec §13 · D35 · issue #173.
 */

export interface CitableAsset extends AssetForLatex {
  readonly kind: string;
}

export interface CitedAsset<T extends CitableAsset> {
  /** O nome no bundle — o que aparece dentro do `\includegraphics`. */
  readonly name: string;
  readonly asset: T;
}

export function citedAssets<T extends CitableAsset>(
  assets: readonly T[],
  sourceLatex: string,
): readonly CitedAsset<T>[] {
  const cited: CitedAsset<T>[] = [];
  const seen = new Set<string>();

  for (const asset of assets) {
    if (!isAssetKind(asset.kind) || !isSourceAsset(asset.kind)) continue;

    const name = assetLatexName(asset);

    // O corpo é quem decide. Um `indexOf` basta: o nome carrega o hash do conteúdo, então ele não
    // aparece por acidente em texto nenhum.
    if (!sourceLatex.includes(name)) continue;
    if (seen.has(name)) continue;

    seen.add(name);
    cited.push({ name, asset });
  }

  return cited;
}

/**
 * O nome pelo qual o LaTeX referencia um asset.
 *
 * Uma questão pode ter figuras, e o `\includegraphics{...}` precisa citar **algo**. Esse algo é o
 * mesmo nome que o worker usa para gravar o arquivo no diretório temporário do job (D35), então
 * ele tem três exigências que não se negociam: previsível, seguro e estável.
 *
 * - **Previsível** porque é a pessoa que o lê e edita, no meio do enunciado dela.
 * - **Seguro** porque o contrato recusa barra, `..` e nome absoluto: um nome que escapa do
 *   diretório do job é o caminho mais curto para escrever fora dele.
 * - **Estável** porque o nome entra no LaTeX, que é gravado — se ele mudasse entre compilações, o
 *   enunciado de ontem pararia de compilar hoje.
 *
 * O sufixo é o começo do `sha256`. Não é enfeite: dois arquivos com o mesmo nome original numa
 * questão só — `grafico.png` da página 3 e `grafico.png` da página 7 — colidiriam, e o segundo
 * sobrescreveria o primeiro dentro do job, em silêncio. Amarrar o nome ao conteúdo também é o que
 * mantém a D29 valendo aqui: mesmo conteúdo, mesmo nome; conteúdo diferente, nome diferente.
 *
 * Ver spec §13 · D29 · D35 · issue #173.
 */

/** O bastante para não colidir numa questão, e curto o bastante para caber no texto. */
const HASH_CHARS = 8;

const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/**
 * A extensão, do MIME e não do nome original.
 *
 * O `\includegraphics` escolhe o leitor pela extensão, e um `.jpeg` renomeado para `.png` faz o
 * `pdflatex` falhar com "Cannot determine size of graphic" — mensagem que manda procurar defeito
 * no LaTeX, não no arquivo. O MIME já foi conferido contra o conteúdo na ingestão.
 */
export const latexExtensionFor = (mimeType: string): string =>
  EXTENSION_BY_MIME[mimeType.toLowerCase()] ?? "png";

/** Minúsculo, sem acento, sem espaço — e nunca vazio. */
function slug(base: string): string {
  const cleaned = base
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return cleaned === "" ? "figura" : cleaned;
}

export interface AssetForLatex {
  readonly sha256: string;
  readonly mimeType: string;
  readonly originalFilename: string | null;
}

export const assetLatexName = (asset: AssetForLatex): string =>
  `${slug(asset.originalFilename ?? "figura")}-${asset.sha256.slice(0, HASH_CHARS)}.${latexExtensionFor(asset.mimeType)}`;

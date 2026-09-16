import { assetLatexName } from "@modules/assets/domain/asset-latex-name";

import type { LegacyFsProbe } from "./legacy-config";

/**
 * A figura legada como **asset** do produto novo.
 *
 * O acervo guarda a figura fora do banco (`pub<N>/idQuestion<M>/images/clipboard_<ts>.png`) e o
 * LaTeX cita esse caminho. O produto novo não tem pasta nenhuma: a figura vira `Asset`, viaja no
 * `RenderBundle` com um nome simples, e o LaTeX precisa citar **esse** nome. As regras de nome e
 * de tipo ficam aqui, no domínio, para que o import de uma biblioteca nova e o backfill do banco
 * já importado cheguem ao mesmo resultado — a mesma figura, com o mesmo nome, nos dois caminhos.
 *
 * Ver checklist Fase 11, bloco "Figuras de questão → `Asset`" · issue #111 · #173.
 */

/**
 * Lê o arquivo de uma figura no acervo de origem.
 *
 * Separado de `LegacyFsProbe` de propósito: o relatório de ausentes só pergunta "existe?", e
 * quem o dubla nos testes não deveria precisar fingir bytes. Ler é responsabilidade a mais, e só
 * o import de figuras a tem.
 */
export interface LegacyFileReader extends Pick<LegacyFsProbe, "exists"> {
  readFile(path: string): Promise<Uint8Array>;
}

/**
 * Só o que o `pdflatex` inclui direto **e** o produto aceita como imagem de questão.
 *
 * `.eps` fica de fora: o acervo tem 211 deles como **fonte** de figura, não como citação de
 * `\includegraphics` (o levantamento de 2026-09-02 achou um formato só, `.png` de clipboard).
 * Quando aparecer um citado, ele vira `formato-nao-suportado` no relatório, não asset torto.
 */
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".pdf": "application/pdf",
};

export const legacyFigureFilename = (posixPath: string): string =>
  posixPath.split("/").pop() ?? posixPath;

/** `null` quando a extensão não é uma que o produto sabe guardar como figura de questão. */
export function legacyFigureMimeType(posixPath: string): string | null {
  const name = legacyFigureFilename(posixPath).toLowerCase();
  const dot = name.lastIndexOf(".");
  if (dot < 1) return null;
  return MIME_BY_EXTENSION[name.slice(dot)] ?? null;
}

/**
 * O tipo de asset de uma figura importada.
 *
 * `QUESTION_IMAGE`, e não `SOURCE_IMAGE`: quem sobe um arquivo pela interface está trazendo uma
 * fonte, e só o uso dentro da questão decide o outro (ver `inferKind`). Aqui o uso já está
 * decidido — o LaTeX da questão cita o arquivo —, então o tipo é o da figura em uso.
 */
export const LEGACY_FIGURE_ASSET_KIND = "QUESTION_IMAGE" as const;

/**
 * O nome que o LaTeX importado passa a citar.
 *
 * É o **mesmo** `assetLatexName` da Fase 14 — o que a rota de upload devolve e o que
 * `loadQuestionAssets` calcula na hora de montar o bundle. Se o import inventasse um nome
 * próprio, a figura ficaria gravada, ligada à questão, e mesmo assim nunca viajaria: o montador
 * do bundle só leva o que o corpo cita **por esse nome**.
 */
export const legacyFigureLatexName = (
  sourcePath: string,
  sha256: string,
  mimeType: string,
): string =>
  assetLatexName({ sha256, mimeType, originalFilename: legacyFigureFilename(sourcePath) });

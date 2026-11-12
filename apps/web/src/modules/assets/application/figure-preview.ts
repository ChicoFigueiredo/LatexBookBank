import { latexNameHash } from "@modules/assets/domain/asset-latex-name";

/**
 * A figura do preview rápido: o que o `\includegraphics` cita, numa forma que o navegador mostra.
 *
 * O recorte que o scan grava é PDF — vetorial, porque é o LaTeX quem o usa —, e `<img>` não abre
 * PDF. O preview pede a figura pelo nome citado e recebe PNG: a imagem que já é PNG ou JPEG vai
 * como está, e o PDF vira a primeira página rasterizada.
 *
 * Só esses três tipos. O SVG, que o navegador também abriria, executaria script se aberto como
 * documento (#257); fora do preview ele continua indo ao LaTeX normalmente.
 */

export interface CitedFigure {
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sha256: string;
}

export interface FigurePreviewDeps {
  /** O asset que o nome cita, no acervo de quem pede — ou nada. */
  readonly find: (name: string, hash: string) => Promise<CitedFigure | null>;
  readonly read: (storageKey: string) => Promise<Uint8Array>;
  /** A primeira página do PDF, em PNG. */
  readonly rasterizePdf: (pdf: Uint8Array) => Promise<Uint8Array>;
}

export interface FigurePreview {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  /** Do arquivo de origem: o PNG de um mesmo conteúdo é sempre o mesmo. */
  readonly sha256: string;
}

const AS_IS = new Set(["image/png", "image/jpeg"]);

export async function figurePreview(
  name: string,
  deps: FigurePreviewDeps,
): Promise<FigurePreview | null> {
  const hash = latexNameHash(name);
  if (hash === null) return null;

  const figure = await deps.find(name, hash);
  if (figure === null) return null;

  const mimeType = figure.mimeType.toLowerCase();
  if (AS_IS.has(mimeType)) {
    return { bytes: await deps.read(figure.storageKey), mimeType, sha256: figure.sha256 };
  }
  if (mimeType === "application/pdf") {
    const png = await deps.rasterizePdf(await deps.read(figure.storageKey));
    return { bytes: png, mimeType: "image/png", sha256: figure.sha256 };
  }
  return null;
}

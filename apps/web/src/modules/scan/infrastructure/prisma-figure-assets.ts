import "server-only";

import { assetLatexName } from "@modules/assets/domain/asset-latex-name";
import { storeAsset } from "@modules/assets/application/store-asset";
import { createAsset } from "@modules/assets/infrastructure/prisma-asset-writer";
import type { FigureAssets, FigureFile } from "@modules/scan/application/figure-pass";
import type { StorageProvider } from "@/shared/ports";

/**
 * Os arquivos da figura no acervo (D58).
 *
 * Dois assets por figura, e os dois são `CROP` — que é o que eles são: o recorte de uma âncora
 * de um asset fonte. O que muda é o tipo do conteúdo: o **PDF** é o que o `\includegraphics`
 * inclui, e o **PNG** é o que a tela mostra.
 *
 * O nome que o LaTeX cita sai do `assetLatexName`, o mesmo das figuras do legado e dos recortes
 * da captura: nome legível mais o começo do hash. Dedup é de graça — a `storageKey` é o hash do
 * conteúdo, então a mesma figura em duas varreduras é um asset só.
 */
export class PrismaFigureAssets implements FigureAssets {
  constructor(private readonly storage: StorageProvider) {}

  private async put(input: {
    readonly workspaceId: string;
    readonly publicationId: string;
    readonly filename: string;
    readonly mimeType: string;
    readonly content: Uint8Array;
  }): Promise<{ id: string; latexName: string }> {
    const stored = await storeAsset(
      {
        workspaceId: input.workspaceId,
        filename: input.filename,
        mimeType: input.mimeType,
        content: input.content,
        kind: "CROP",
      },
      this.storage,
    );
    const asset = await createAsset({ ...stored, workspaceId: input.workspaceId, publicationId: input.publicationId });
    return {
      id: asset.id,
      latexName: assetLatexName({
        sha256: stored.sha256,
        mimeType: input.mimeType,
        originalFilename: input.filename,
      }),
    };
  }

  async save(input: {
    readonly workspaceId: string;
    readonly publicationId: string;
    readonly file: FigureFile;
    readonly label: string | null;
    readonly pageNumber: number;
  }): Promise<{ assetId: string; latexName: string; screenAssetId: string }> {
    // O nome carrega o rótulo do livro quando existe: `figura-1-1-ab12cd34.pdf` diz de onde veio
    // a quem abrir o diretório do job para entender uma compilação.
    const base = (input.label ?? `figura-p${input.pageNumber}`).toLowerCase();
    const extension = input.file.mimeType === "application/pdf" ? "pdf" : "png";

    const main = await this.put({
      workspaceId: input.workspaceId,
      publicationId: input.publicationId,
      filename: `${base}.${extension}`,
      mimeType: input.file.mimeType,
      content: input.file.content,
    });

    const screen =
      input.file.mimeType === "image/png"
        ? main
        : await this.put({
            workspaceId: input.workspaceId,
            publicationId: input.publicationId,
            filename: `${base}-tela.png`,
            mimeType: "image/png",
            content: input.file.screen,
          });

    return { assetId: main.id, latexName: main.latexName, screenAssetId: screen.id };
  }
}

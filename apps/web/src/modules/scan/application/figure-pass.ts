import type { NormalizedBox } from "@modules/assets/domain/source-anchor";
import type { FigureKind } from "@modules/scan/domain/figures";
import type { ScanItem } from "@modules/scan/domain/scan-item";

import type { OpenedPdf } from "./pdf-document";
import type { StepProgress } from "./run-scan";
import type { ScanItemChanges, ScanRun } from "./scan-store";

/**
 * A passada das figuras (D58, ADR 0005): cada item de figura vira arquivo no acervo.
 *
 * Acontece **durante a varredura**, e não na aprovação, por três razões:
 *
 * - a revisão precisa mostrar a figura, e mostrar exige que ela exista;
 * - a aprovação é uma transação de banco, e escrever arquivo dentro de transação é o jeito mais
 *   curto de deixar arquivo órfão quando ela falha;
 * - o PDF já está aberto aqui. Reabrir um livro de 21 MB na aprovação seria pagar duas vezes.
 *
 * O preço é conhecido: figura rejeitada na revisão deixa arquivo gravado. Como a `storageKey`
 * é o hash do conteúdo, dois scans do mesmo livro não duplicam nada — e o que sobra é um asset
 * sem referência, que a limpeza da lixeira já sabe tratar.
 */

export interface FigureFile {
  readonly content: Uint8Array;
  readonly mimeType: string;
  /** O PNG pequeno, para a tela. */
  readonly screen: Uint8Array;
}

export interface FigureCropper {
  crop(input: {
    readonly pageNumber: number;
    readonly box: NormalizedBox;
    readonly kind: FigureKind;
    readonly pixels: { readonly width: number; readonly height: number } | null;
  }): Promise<FigureFile>;
}

/** Onde os arquivos da figura ficam, e com que nome o LaTeX os cita. */
export interface FigureAssets {
  save(input: {
    readonly workspaceId: string;
    readonly publicationId: string;
    readonly file: FigureFile;
    readonly label: string | null;
    readonly pageNumber: number;
  }): Promise<{ readonly assetId: string; readonly latexName: string; readonly screenAssetId: string }>;
}

export interface FigurePassDeps {
  /** O recorte é montado por execução: ele precisa do PDF daquele livro, aberto e em bytes. */
  readonly cropper: (input: { readonly bytes: Uint8Array; readonly pdf: OpenedPdf }) => FigureCropper;
  readonly assets: FigureAssets;
}

export interface FigurePassInput {
  readonly run: ScanRun;
  readonly items: readonly ScanItem[];
  readonly pdf: OpenedPdf;
  /** O PDF como está no storage: é dele que sai o recorte vetorial, sem redesenhar nada. */
  readonly bytes: Uint8Array;
  readonly save: (changes: ScanItemChanges) => Promise<void>;
  readonly cancelled: () => Promise<boolean>;
  readonly progress?: StepProgress;
}

export interface FigurePassResult {
  readonly saved: number;
  readonly warnings: readonly string[];
}

const kindOf = (item: ScanItem): FigureKind => {
  const kind = item.metadata["figureKind"];
  return kind === "raster" || kind === "mixed" ? kind : "vector";
};

export function createFigurePass(deps: FigurePassDeps) {
  return {
    async run(input: FigurePassInput): Promise<FigurePassResult> {
      const targets = input.items.filter(
        (item) =>
          item.kind === "FIGURE" &&
          item.reviewState !== "REJECTED" &&
          item.metadata["figureAsset"] === undefined &&
          item.regions.length > 0,
      );

      const cropper = deps.cropper({ bytes: input.bytes, pdf: input.pdf });
      const warnings: string[] = [];
      let saved = 0;
      await input.progress?.(0, targets.length);

      for (const [index, item] of targets.entries()) {
        if (await input.cancelled()) break;
        if (index > 0) await input.progress?.(index, targets.length);

        const region = item.regions[0]!;
        try {
          const file = await cropper.crop({
            pageNumber: region.pageNumber,
            box: region.box,
            kind: kindOf(item),
            pixels: null,
          });
          const stored = await deps.assets.save({
            workspaceId: input.run.workspaceId,
            publicationId: input.run.publicationId,
            file,
            label: item.originalLabel,
            pageNumber: region.pageNumber,
          });

          await input.save({
            upserts: [
              {
                ...item,
                metadata: {
                  ...item.metadata,
                  figureAsset: stored.assetId,
                  figureScreenAsset: stored.screenAssetId,
                  figureLatexName: stored.latexName,
                },
              },
            ],
            deletedIds: [],
          });
          saved++;
        } catch (error) {
          // Uma figura que não recorta não derruba a varredura: ela fica na proposta, sem
          // arquivo, e o motivo aparece no diagnóstico — é a revisão que decide o que fazer.
          warnings.push(
            `Figura da página ${region.pageNumber}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      await input.progress?.(targets.length, targets.length);
      return { saved, warnings };
    },
  };
}

export type FigurePass = ReturnType<typeof createFigurePass>;

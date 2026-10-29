import type { AssetKind } from "@modules/assets/domain/asset-kind";

/**
 * O contrato HTTP das rotas de asset que a captura usa, do jeito que a tela o lê.
 *
 * Só tipos, sem nada de servidor: a rota anota a resposta com eles (`satisfies`) e o cliente
 * (`recognition/ui/capture-client.ts`) importa os mesmos (ARQ-10 da revisão de 2026-09-23).
 */

/** `POST /api/assets`, 201. Projeção campo a campo: a `storageKey` não sai do servidor (D26). */
export interface UploadAssetResponse {
  readonly id: string;
  /** O nome que o `\includegraphics` cita. */
  readonly latexName: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
  readonly originalFilename: string;
  readonly kind: AssetKind;
  readonly width: number | null;
  readonly height: number | null;
  /** O upload acabou de virar o PDF fonte do livro: quem tem o router revalida. */
  readonly becameBookSource: boolean;
}

/** `POST /api/assets/crop`, 201: o recorte guardado e a âncora que o liga à página. */
export interface CropAssetResponse {
  readonly anchorId: string;
  readonly cropAssetId: string;
  readonly sourceAssetId: string;
}

"use client";

import type {
  CropAssetResponse,
  UploadAssetResponse,
} from "@modules/assets/application/asset-contract";
import type { RecognitionCandidate } from "@modules/recognition/domain/recognition-review";
import { readReply, type JsonReply } from "@/shared/http/api-client";

/**
 * As três rotas da captura — subir, recortar, reconhecer —, tipadas pelo contrato que elas
 * mesmas anotam (STM-17 e ARQ-10 da revisão de 2026-09-23).
 *
 * Todas mandam `FormData`: o arquivo e o recorte são bytes, e o servidor lê com teto. Cada função
 * devolve a resposta lida (`JsonReply`), e o painel decide a mensagem: ele trata "a rota recusou"
 * e "a resposta veio sem o id" do mesmo jeito.
 */

/** O recorte de uma página: a imagem e onde ela está, em coordenadas normalizadas. */
export interface CropRequest {
  readonly png: Blob;
  readonly sourceAssetId: string;
  readonly publicationId: string;
  readonly pageNumber: number;
  readonly box: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  /** A questão que já existe, quando o recorte é para ela. */
  readonly questionId?: string | null;
}

export interface RecognizeRequest {
  readonly png: Blob;
  readonly cropAssetId: string;
  /** O modo **do provider** (`display`, `mixed`, `text`…), não o rótulo da tela. */
  readonly mode: string;
  /** A âncora vai junto para o servidor **guardar** o que o modelo leu (§26). */
  readonly anchorId?: string | null;
}

function recognizeForm({ png, cropAssetId, mode, anchorId }: RecognizeRequest): FormData {
  const form = new FormData();
  form.set("image", png, "crop.png");
  form.set("cropAssetId", cropAssetId);
  form.set("mode", mode);
  if (anchorId !== undefined && anchorId !== null) form.set("anchorId", anchorId);
  return form;
}

export const captureApi = {
  upload(input: {
    readonly file: File;
    readonly workspaceId: string;
    readonly publicationId: string;
  }): Promise<JsonReply<UploadAssetResponse>> {
    const form = new FormData();
    form.set("file", input.file);
    form.set("workspaceId", input.workspaceId);
    // O livro vai junto: sem ele o `Asset` nascia sem `publicationId` e o PDF que alguém acabou
    // de subir pela pendência "Sem PDF fonte anexado" sumia do livro em silêncio.
    form.set("publicationId", input.publicationId);
    return readReply<UploadAssetResponse>("/api/assets", { method: "POST", body: form });
  },

  saveCrop(crop: CropRequest): Promise<JsonReply<CropAssetResponse>> {
    const form = new FormData();
    form.set("image", crop.png, "crop.png");
    form.set("sourceAssetId", crop.sourceAssetId);
    form.set("publicationId", crop.publicationId);
    form.set("pageNumber", String(crop.pageNumber));
    for (const [key, value] of Object.entries(crop.box)) form.set(key, String(value));
    if (crop.questionId !== undefined && crop.questionId !== null) {
      form.set("questionId", crop.questionId);
    }
    return readReply<CropAssetResponse>("/api/assets/crop", { method: "POST", body: form });
  },

  recognize(request: RecognizeRequest): Promise<JsonReply<RecognitionCandidate>> {
    return readReply<RecognitionCandidate>("/api/recognition", {
      method: "POST",
      body: recognizeForm(request),
    });
  },

  /**
   * Reconhecer dentro do lote: só importa se deu certo. O corpo não é lido — a transcrição fica
   * guardada na âncora, e a fila de captura é quem a mostra.
   */
  async recognizeInBatch(request: RecognizeRequest): Promise<boolean> {
    const response = await fetch("/api/recognition", {
      method: "POST",
      body: recognizeForm(request),
    });
    return response.ok;
  },
};

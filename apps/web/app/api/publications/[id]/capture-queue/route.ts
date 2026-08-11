import { NextResponse } from "next/server";

import { countByState, pendingQueue } from "@modules/recognition/domain/capture-queue";
import { readCaptureFacts } from "@modules/recognition/infrastructure/prisma-capture-queue";

import { toErrorResponse } from "../../../tree-http";

/**
 * A fila de captura de uma publicação — os recortes que ainda não viraram questão.
 *
 * `GET`, e sem estado próprio para escrever: a fila é **derivada** do que já é durável. Ver
 * `capture-queue.ts` para o porquê de não haver tabela.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const items = pendingQueue(await readCaptureFacts(id));

    return NextResponse.json({
      items: items.map((item) => ({
        anchorId: item.anchorId,
        cropAssetId: item.cropAssetId,
        pageNumber: item.pageNumber,
        createdAt: item.createdAt.toISOString(),
        recognizedText: item.recognizedText,
        model: item.extractionModel,
        state: item.state,
      })),
      counts: countByState(items),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

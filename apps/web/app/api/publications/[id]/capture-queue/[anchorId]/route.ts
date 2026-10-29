import { NextResponse } from "next/server";

import { discardCapture } from "@modules/recognition/application/discard-capture";
import { PrismaCaptureDiscarder } from "@modules/recognition/infrastructure/prisma-capture-queue";

import { toErrorResponse } from "../../../../http";

/**
 * Descarta um recorte da fila.
 *
 * Apaga a âncora e o crop — um recorte rejeitado é uma seleção errada na página, não patrimônio. A
 * **fonte** (o PDF, a imagem) continua intacta, e recortar de novo é sempre possível.
 *
 * Recusa com 409 quando o recorte já virou questão: ali ele é a origem de um dado do acervo, e
 * apagá-lo deixaria a questão sem poder responder de onde veio.
 */
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ anchorId: string }> },
) {
  const { anchorId } = await params;

  try {
    // Ausente é 404, e recorte que já virou questão é 409 `capture_in_use`: as duas recusas vêm do
    // caso de uso, e o status do tradutor de erros.
    await discardCapture(new PrismaCaptureDiscarder(), anchorId);

    return NextResponse.json({ discarded: anchorId });
  } catch (error) {
    return toErrorResponse(error);
  }
}

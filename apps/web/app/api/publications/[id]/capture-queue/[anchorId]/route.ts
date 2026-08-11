import { NextResponse } from "next/server";

import { discardCapture } from "@modules/recognition/infrastructure/prisma-capture-queue";

import { toErrorResponse } from "../../../../tree-http";

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
    const outcome = await discardCapture(anchorId);

    if (outcome === "absent") {
      return NextResponse.json(
        { error: "not_found", message: "Este recorte não está mais na fila." },
        { status: 404 },
      );
    }
    if (outcome === "in-use") {
      return NextResponse.json(
        {
          error: "capture_in_use",
          message:
            "Este recorte é a origem de uma questão. Exclua a questão se quiser descartá-lo.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ discarded: anchorId });
  } catch (error) {
    return toErrorResponse(error);
  }
}

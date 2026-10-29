import { NextResponse } from "next/server";

import { confirmNodeBody } from "@modules/document-tree/application/save-node-body";
import { PrismaNodeBodyRepository } from "@modules/document-tree/infrastructure/prisma-node-body";

import { toErrorResponse } from "../../../../../../http";

/**
 * Conferir o corpo de um nó (D40, #252): o exemplo ou a teoria que o scan escreveu foi lido, e sai
 * de *a revisar*. `POST` porque grava uma revisão; o corpo não muda.
 */
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; nodeId: string }> },
) {
  const { id, nodeId } = await params;
  try {
    await confirmNodeBody(new PrismaNodeBodyRepository(), { publicationId: id, nodeId });
    return NextResponse.json({ confirmed: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

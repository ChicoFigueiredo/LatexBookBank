import { NextResponse } from "next/server";

import { removeQuestionAnchor } from "@modules/assets/application/edit-node-anchors";
import { PrismaNodeAnchors } from "@modules/assets/infrastructure/prisma-node-anchors";

import { toErrorResponse } from "../../../../http";

/** Retirar uma âncora da questão: desfaz a ligação, não apaga a âncora (D29). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ questionId: string; anchorId: string }> },
) {
  try {
    const { questionId, anchorId } = await params;
    await removeQuestionAnchor(new PrismaNodeAnchors(), { questionId, anchorId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

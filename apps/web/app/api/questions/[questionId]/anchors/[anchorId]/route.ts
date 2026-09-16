import { NextResponse } from "next/server";

import { AnchorEditError, removeQuestionAnchor } from "@modules/assets/application/edit-node-anchors";
import { PrismaNodeAnchors } from "@modules/assets/infrastructure/prisma-node-anchors";

import { toErrorResponse } from "../../../../tree-http";

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
    if (error instanceof AnchorEditError) {
      return NextResponse.json({ error: "bad_request", message: error.message }, { status: 400 });
    }
    return toErrorResponse(error);
  }
}

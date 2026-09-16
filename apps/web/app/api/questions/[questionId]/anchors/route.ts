import { NextResponse } from "next/server";

import { addQuestionAnchor, AnchorEditError } from "@modules/assets/application/edit-node-anchors";
import { InvalidAnchorError } from "@modules/assets/domain/source-anchor";
import { PrismaNodeAnchors } from "@modules/assets/infrastructure/prisma-node-anchors";

import { BadRequestError, readJson, toErrorResponse } from "../../../tree-http";

/**
 * As âncoras de uma questão, em ordem e com papel (D50) — o que o *Ver fonte* do editor marca no
 * PDF (D43). Acrescentar cria uma âncora nova sobre o mesmo PDF; questão sem âncora devolve lista
 * vazia, e o PDF fonte do livro quando há.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ questionId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { questionId } = await params;
    const repository = new PrismaNodeAnchors();
    const [question, anchors] = await Promise.all([
      repository.findByQuestion(questionId),
      repository.listForQuestion(questionId),
    ]);
    return NextResponse.json({
      sourceAssetId: question?.sourceAssetId ?? null,
      anchors,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { questionId } = await params;
    const body = await readJson(request);
    const box = body["box"] as Record<string, unknown> | undefined;
    const pageNumber = Number(body["pageNumber"]);
    if (!box || typeof box !== "object") throw new BadRequestError("`box` é obrigatório.");

    const anchorId = await addQuestionAnchor(new PrismaNodeAnchors(), {
      questionId,
      pageNumber,
      box: { x: Number(box["x"]), y: Number(box["y"]), width: Number(box["width"]), height: Number(box["height"]) },
      role: body["role"],
    });
    return NextResponse.json({ anchorId }, { status: 201 });
  } catch (error) {
    if (error instanceof AnchorEditError || error instanceof InvalidAnchorError) {
      return NextResponse.json({ error: "bad_request", message: error.message }, { status: 400 });
    }
    return toErrorResponse(error);
  }
}

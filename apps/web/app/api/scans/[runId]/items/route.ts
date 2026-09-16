import { NextResponse } from "next/server";
import { z } from "zod";

import { reviewScan } from "@modules/scan/application/review-scan";
import { InvalidReviewError, type ReviewOperation } from "@modules/scan/domain/review";
import { scanDeps } from "@modules/scan/infrastructure/scan-deps";

import { toScanErrorResponse } from "../../scan-http";
import { BadRequestError, readJson } from "../../../tree-http";

/**
 * Uma operação de revisão sobre a proposta (§36). O corpo é a operação; a resposta, os itens que
 * mudaram e os que saíram. Validado aqui na forma, e no domínio no mérito.
 */
export const dynamic = "force-dynamic";

const box = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });
const region = z.object({ pageNumber: z.number().int(), box, role: z.string() });
const id = z.string().min(1);

const operationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("setKind"), itemId: id, kind: z.string() }),
  z.object({ type: z.literal("setTitle"), itemId: id, title: z.string().nullable() }),
  z.object({ type: z.literal("setLabel"), itemId: id, label: z.string().nullable() }),
  z.object({ type: z.literal("reparent"), itemId: id, parentId: id.nullable() }),
  z.object({ type: z.literal("promote"), itemId: id }),
  z.object({ type: z.literal("demote"), itemId: id }),
  z.object({ type: z.literal("merge"), itemIds: z.array(id).min(2) }),
  z.object({ type: z.literal("split"), itemId: id, regionIndex: z.number().int() }),
  z.object({ type: z.literal("addRegion"), itemId: id, region }),
  z.object({ type: z.literal("removeRegion"), itemId: id, regionIndex: z.number().int() }),
  z.object({ type: z.literal("resizeRegion"), itemId: id, regionIndex: z.number().int(), box }),
  z.object({ type: z.literal("moveRegion"), itemId: id, from: z.number().int(), to: z.number().int() }),
  z.object({ type: z.literal("setRegionRole"), itemId: id, regionIndex: z.number().int(), role: z.string() }),
  z.object({ type: z.literal("editText"), itemId: id, text: z.string().max(200_000).nullable() }),
  z.object({ type: z.literal("editLatex"), itemId: id, latex: z.string().max(200_000).nullable() }),
  z.object({ type: z.literal("accept"), itemIds: z.array(id) }),
  z.object({ type: z.literal("reject"), itemIds: z.array(id) }),
  z.object({ type: z.literal("reopen"), itemIds: z.array(id) }),
  z.object({ type: z.literal("acceptSuggested") }),
  z.object({
    type: z.literal("addItem"),
    kind: z.string(),
    parentId: id.nullable(),
    afterId: id.nullable(),
    region,
    title: z.string().nullable().optional(),
  }),
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const parsed = operationSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new BadRequestError(`Operação inválida: ${parsed.error.issues[0]?.message ?? ""}`);

    const { store } = scanDeps();
    const result = await reviewScan(
      { store, newId: () => crypto.randomUUID() },
      runId,
      parsed.data as ReviewOperation,
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InvalidReviewError) {
      return NextResponse.json({ error: "invalid_review", message: error.message }, { status: 409 });
    }
    return toScanErrorResponse(error);
  }
}

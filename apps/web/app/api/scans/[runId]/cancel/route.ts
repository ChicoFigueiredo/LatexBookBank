import { NextResponse } from "next/server";

import { cancelScan } from "@modules/scan/application/control-scan";
import { scanDeps } from "@modules/scan/infrastructure/scan-deps";

import { toScanErrorResponse } from "../../scan-http";

/** Cancelar (§49): o laço para na próxima página, e o que já foi lido fica. */
export async function POST(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    await cancelScan(scanDeps(), runId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toScanErrorResponse(error);
  }
}

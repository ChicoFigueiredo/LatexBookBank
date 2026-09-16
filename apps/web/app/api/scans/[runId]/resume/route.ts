import { NextResponse } from "next/server";

import { resumeScan } from "@modules/scan/application/control-scan";
import { scanDeps } from "@modules/scan/infrastructure/scan-deps";

import { toScanErrorResponse } from "../../scan-http";

/** Retomar do ponto de parada — depois de reiniciar o servidor, de uma falha ou de cancelar. */
export async function POST(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    await resumeScan(scanDeps(), runId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toScanErrorResponse(error);
  }
}

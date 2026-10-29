import { NextResponse } from "next/server";

import { approveScan } from "@modules/scan/application/approve-scan";
import type { ScanApprovalResponse } from "@modules/scan/application/scan-contract";
import { PrismaScanApproval } from "@modules/scan/infrastructure/prisma-scan-approval";
import { scanDeps } from "@modules/scan/infrastructure/scan-deps";

import { toErrorResponse } from "../../../http";
import { readJson } from "../../../http";

/**
 * Aprovar a proposta (D45, D53): o que foi aceito — e, em lote, o sugerido — entra no acervo sob o
 * destino escolhido. A resposta diz o que foi criado, reaproveitado, e o que ficou de fora e por quê.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const body = await readJson(request);
    const { store } = scanDeps();
    const result = await approveScan(
      { store, writer: new PrismaScanApproval() },
      {
        runId,
        destinationId: typeof body["destinationId"] === "string" && body["destinationId"] !== "" ? body["destinationId"] : null,
        includeSuggested: body["includeSuggested"] === true,
      },
    );
    return NextResponse.json(result satisfies ScanApprovalResponse);
  } catch (error) {
    return toErrorResponse(error);
  }
}

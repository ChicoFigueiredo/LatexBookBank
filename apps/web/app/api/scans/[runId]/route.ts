import { NextResponse } from "next/server";

import { getScan } from "@modules/scan/application/control-scan";
import { scanDeps } from "@modules/scan/infrastructure/scan-deps";

import { scanRunDto } from "../scan-dto";
import { toScanErrorResponse } from "../scan-http";

/**
 * Uma execução e a sua proposta. `?items=0` devolve só o estado — é o que a tela consulta
 * enquanto o laço anda, sem carregar centenas de itens a cada batida.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const withItems = new URL(request.url).searchParams.get("items") !== "0";
    const { store, runner } = scanDeps();
    const view = await getScan({ store, runner }, runId, { withItems });

    return NextResponse.json({
      run: scanRunDto(view.run, view.running, view.interrupted),
      items: view.items,
    });
  } catch (error) {
    return toScanErrorResponse(error);
  }
}

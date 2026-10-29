import { NextResponse } from "next/server";

import { previewImportRemoval, removeImport, type RemovalScope } from "@modules/scan/application/remove-import";
import { PrismaScanImport } from "@modules/scan/infrastructure/prisma-scan-import";
import { scanDeps } from "@modules/scan/infrastructure/scan-deps";

import { toScanErrorResponse } from "../../scan-http";

/**
 * A importação de uma execução: o que ela criou no acervo (D57, ADR 0006).
 *
 * `GET` é a conferência — os números e os preservados, com o motivo de cada um —, e é o que a
 * confirmação mostra antes de apagar. `DELETE` executa, e só depois de alguém ter visto.
 */
export const dynamic = "force-dynamic";

const scopeOf = (request: Request): RemovalScope =>
  new URL(request.url).searchParams.get("scope") === "proposal" ? "proposal" : "import";

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const { store } = scanDeps();
    return NextResponse.json(await previewImportRemoval({ store, imports: new PrismaScanImport() }, runId));
  } catch (error) {
    return toScanErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const { store } = scanDeps();
    const result = await removeImport({ store, imports: new PrismaScanImport() }, { runId, scope: scopeOf(request) });
    return NextResponse.json(result);
  } catch (error) {
    return toScanErrorResponse(error);
  }
}

import { NextResponse } from "next/server";

import { PrismaValidationWriter } from "@modules/questions/infrastructure/prisma-validation-writer";
import { previewImportRemoval, removeImport, type RemovalScope } from "@modules/scan/application/remove-import";
import type { ImportPreviewResponse, ImportRemovalResponse } from "@modules/scan/application/scan-contract";
import { PrismaScanImport } from "@modules/scan/infrastructure/prisma-scan-import";
import { scanDeps } from "@modules/scan/infrastructure/scan-deps";

import { toErrorResponse } from "../../../http";

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
    const preview = await previewImportRemoval({ store, imports: new PrismaScanImport() }, runId);
    return NextResponse.json(preview satisfies ImportPreviewResponse);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const { store } = scanDeps();
    const result = await removeImport(
      { store, imports: new PrismaScanImport() },
      { runId, scope: scopeOf(request) },
      new PrismaValidationWriter(),
    );
    return NextResponse.json(result satisfies ImportRemovalResponse);
  } catch (error) {
    return toErrorResponse(error);
  }
}

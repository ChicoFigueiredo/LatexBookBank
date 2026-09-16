import { NextResponse } from "next/server";

import { ScanRunNotFoundError, ScanRunStateError } from "@modules/scan/application/control-scan";
import { NoSourcePdfError, UnknownCaptureProfileError } from "@modules/scan/application/start-scan";
import { InvalidScanSettingsError } from "@modules/scan/domain/scan-run";

import { toErrorResponse } from "../tree-http";

/**
 * Os erros do scan em HTTP. O que é pedido mal formado é 400; o que depende do estado — o livro
 * sem PDF, a execução que já terminou — é 409, para a tela mostrar a mensagem em vez de tratar
 * como defeito dela.
 */
export function toScanErrorResponse(error: unknown): NextResponse {
  if (error instanceof UnknownCaptureProfileError || error instanceof InvalidScanSettingsError) {
    return NextResponse.json({ error: "bad_request", message: error.message }, { status: 400 });
  }
  if (error instanceof ScanRunNotFoundError) {
    return NextResponse.json({ error: "not_found", message: error.message }, { status: 404 });
  }
  if (error instanceof NoSourcePdfError) {
    return NextResponse.json({ error: "no_source_pdf", message: error.message }, { status: 409 });
  }
  if (error instanceof ScanRunStateError) {
    return NextResponse.json({ error: "conflict", message: error.message }, { status: 409 });
  }
  return toErrorResponse(error);
}

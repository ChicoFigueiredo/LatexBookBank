import { NextResponse } from "next/server";

import { startScan } from "@modules/scan/application/start-scan";
import { scanDeps } from "@modules/scan/infrastructure/scan-deps";

import { toScanErrorResponse } from "../../../scans/scan-http";
import { readJson } from "../../../tree-http";
import { scanRunDto } from "../../../scans/scan-dto";

/**
 * As execuções de scan de um livro, e o pedido de uma nova (D49, D53).
 *
 * O `POST` responde assim que a execução está gravada: o laço roda depois, fora da requisição, e a
 * tela acompanha pelo `GET` da execução. Pedir de novo a mesma coisa devolve a mesma execução
 * (`reused: true`), com 200 em vez de 201.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { store, runner } = scanDeps();
    const runs = await store.listRuns(id);
    return NextResponse.json({ runs: runs.map((run) => scanRunDto(run, runner.isRunning(run.id))) });
  } catch (error) {
    return toScanErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await readJson(request);
    const deps = scanDeps();

    const { run, reused } = await startScan(deps, {
      publicationId: id,
      profileId: typeof body["profileId"] === "string" ? body["profileId"] : "",
      pageFrom: body["pageFrom"],
      pageTo: body["pageTo"],
      useAi: body["useAi"],
      recognizeMath: body["recognizeMath"],
      forceNew: body["forceNew"] === true,
    });

    return NextResponse.json(
      { run: scanRunDto(run, deps.runner.isRunning(run.id)), reused },
      { status: reused ? 200 : 201 },
    );
  } catch (error) {
    return toScanErrorResponse(error);
  }
}

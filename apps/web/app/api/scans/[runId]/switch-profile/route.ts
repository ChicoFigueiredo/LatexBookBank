import { NextResponse } from "next/server";

import { switchProfile } from "@modules/scan/application/switch-profile";
import { scanDeps } from "@modules/scan/infrastructure/scan-deps";

import { toErrorResponse } from "../../../http";
import { readJson } from "../../../http";
import { scanRunDto } from "../../scan-dto";

/**
 * Varrer de novo com outro perfil, herdando o que já foi revisado (`domain/inherit-review.ts`).
 *
 * Devolve 201 com a execução nova: é outra varredura, não a mesma mudando de ideia.
 */
export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const body = await readJson(request);
    const deps = scanDeps();

    const { run } = await switchProfile(deps, {
      runId,
      profileId: typeof body["profileId"] === "string" ? body["profileId"] : "",
    });

    return NextResponse.json({ run: scanRunDto(run, deps.runner.isRunning(run.id)) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

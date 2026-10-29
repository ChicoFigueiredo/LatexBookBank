import { NextResponse } from "next/server";

import { suggestCaptureProfile } from "@modules/scan/application/suggest-profile";
import { scanDeps } from "@modules/scan/infrastructure/scan-deps";
import { storageKeyOfAsset } from "@modules/scan/infrastructure/prisma-scan-store";

import { toScanErrorResponse } from "../../../scans/scan-http";

/**
 * O palpite de perfil para o PDF deste livro (ADR 0007).
 *
 * É uma rota, e não parte da página, porque abrir o PDF custa perto de um segundo: a tela do scan
 * aparece na hora e o palpite chega depois, em vez de a tela inteira esperar por ele.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { sources, storage, opener } = scanDeps();
    const suggestion = await suggestCaptureProfile({ sources, storage, opener, sourceKey: storageKeyOfAsset }, id);
    return NextResponse.json(suggestion ?? { ranking: [], sampledPages: 0 });
  } catch (error) {
    return toScanErrorResponse(error);
  }
}

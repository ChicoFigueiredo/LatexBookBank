import { NextResponse } from "next/server";

import { env as appEnv } from "@/shared/config/env";
import { asStorageKey } from "@/shared/ports/storage-provider";
import { reprocessItem } from "@modules/scan/application/review-scan";
import { storageKeyOfAsset } from "@modules/scan/infrastructure/prisma-scan-store";
import { scanDeps } from "@modules/scan/infrastructure/scan-deps";
import { mathPassFromEnv, semanticPassFromEnv } from "@modules/scan/infrastructure/scan-passes";

import { toErrorResponse } from "../../../../../http";
import { BadRequestError, readJson } from "../../../../../http";

/** Reprocessar um item com IA ou com o reconhecimento matemático (§36). Síncrono: é um item só. */
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string; itemId: string }> },
) {
  try {
    const { runId, itemId } = await params;
    const body = await readJson(request);
    const what = body["what"];
    if (what !== "ai" && what !== "math" && what !== "figure") {
      throw new BadRequestError("`what` precisa ser `ai`, `math` ou `figure`.");
    }

    const env = appEnv();
    const { store, storage, opener, figures } = scanDeps();
    const item = await reprocessItem(
      {
        store,
        opener,
        readSource: async (assetId) => {
          const key = await storageKeyOfAsset(assetId);
          return key ? (await storage.get(asStorageKey(key))).content : null;
        },
        semantic: semanticPassFromEnv(env),
        math: mathPassFromEnv(env),
        figures,
      },
      runId,
      itemId,
      what,
    );
    return NextResponse.json({ item });
  } catch (error) {
    return toErrorResponse(error);
  }
}

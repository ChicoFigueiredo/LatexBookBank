import { NextResponse } from "next/server";

import { env as appEnv } from "@/shared/config/env";
import { LocalFileStorageProvider } from "@infrastructure/storage/local/local-file-storage-provider";
import { PrismaNodeBodyRepository } from "@modules/document-tree/infrastructure/prisma-node-body";
import { executeRender } from "@modules/rendering/application/execute-render";
import { buildRenderBundle, buildSourceMap } from "@modules/rendering/domain/build-render-bundle";
import { profileById, QUESTION_PREVIEW_PROFILE } from "@modules/rendering/domain/latex-profile";
import { PrismaRenderJobRepository } from "@modules/rendering/infrastructure/prisma-render-job-repository";
import { RenderWorkerExecutor } from "@modules/rendering/infrastructure/render-worker-executor";
import { RendererUnavailableError } from "@/shared/ports";

import { BadRequestError, readJson, toErrorResponse } from "../../../../../tree-http";

/**
 * Compila o corpo de um nó (ADR 0001: "um capítulo com corpo é compilável").
 *
 * O mesmo worker e o mesmo cache por hash da questão: o corpo entra no documento no lugar do
 * enunciado, sem alternativas nem resolução. É o primeiro `RenderJob` sem questão — a coluna já
 * era anulável.
 */
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; nodeId: string }> },
) {
  const { id, nodeId } = await params;
  try {
    const repository = new PrismaNodeBodyRepository();
    const node = await repository.find(id, nodeId);
    if (!node) {
      return NextResponse.json({ error: "not_found", message: "Nó não encontrado." }, { status: 404 });
    }

    const env = appEnv();
    if (env.rendererBaseUrl === null || env.rendererSecret === null) {
      return NextResponse.json(
        {
          error: "renderer_not_configured",
          message:
            "`RENDERER_BASE_URL` e `RENDERER_SECRET` não estão definidos. " +
            "Suba o worker com `docker compose up -d` e preencha o `.env.local`.",
        },
        { status: 503 },
      );
    }

    const body = await readJson(request).catch(() => ({}) as Record<string, unknown>);
    const profileId = body["profileId"];
    if (profileId !== undefined && typeof profileId !== "string") {
      throw new BadRequestError("`profileId` precisa ser texto.");
    }
    const profile = profileId === undefined ? QUESTION_PREVIEW_PROFILE : profileById(profileId);
    if (profile === null) throw new BadRequestError(`Perfil \`${String(profileId)}\` não existe.`);

    const workspaceId = await repository.workspaceOf(id);
    if (!workspaceId) {
      return NextResponse.json({ error: "not_found", message: "Livro não encontrado." }, { status: 404 });
    }

    const bundleInput = {
      jobId: crypto.randomUUID(),
      question: {
        id: node.nodeId,
        type: "DISCURSIVE",
        statementLatex: node.bodyLatex,
        solutionLatex: "",
        complementLatex: "",
        options: [],
      },
      profile,
    };
    const bundle = buildRenderBundle(bundleInput);

    const executor = new RenderWorkerExecutor({ baseUrl: env.rendererBaseUrl, secret: env.rendererSecret });
    request.signal.addEventListener("abort", () => void executor.cancel(bundle.jobId), { once: true });

    const { job, cacheHit } = await executeRender(
      { workspaceId, questionId: null, bundle, assets: new Map() },
      {
        executor,
        storage: new LocalFileStorageProvider({ rootDir: env.storageRoot }),
        jobs: new PrismaRenderJobRepository(),
        rendererVersion: process.env["RENDERER_VERSION"] ?? "0.0.0-dev",
      },
    );

    return NextResponse.json({
      jobId: job.id,
      state: job.state,
      success: job.success,
      cacheHit,
      durationMs: job.durationMs,
      diagnostics: job.diagnostics,
      stdout: job.stdout,
      sourceLatex: bundle.sourceLatex,
      sourceMap: buildSourceMap(bundleInput),
      artifacts: job.artifacts.map((artifact) => ({
        name: artifact.name,
        kind: artifact.kind,
        mimeType: artifact.mimeType,
        sizeBytes: artifact.sizeBytes,
        width: artifact.width,
        height: artifact.height,
      })),
    });
  } catch (error) {
    if (error instanceof RendererUnavailableError) {
      return NextResponse.json({ error: "renderer_unavailable", message: error.message }, { status: 503 });
    }
    return toErrorResponse(error);
  }
}

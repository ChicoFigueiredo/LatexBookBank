import { NextResponse } from "next/server";

import { executeRender } from "@modules/rendering/application/execute-render";
import { buildRenderBundle } from "@modules/rendering/domain/build-render-bundle";
import { profileById, QUESTION_PREVIEW_PROFILE } from "@modules/rendering/domain/latex-profile";
import { loadQuestionForRender } from "@modules/rendering/infrastructure/prisma-question-render-source";
import { PrismaRenderJobRepository } from "@modules/rendering/infrastructure/prisma-render-job-repository";
import { RenderWorkerExecutor } from "@modules/rendering/infrastructure/render-worker-executor";
import { LocalFileStorageProvider } from "@infrastructure/storage/local/local-file-storage-provider";
import { env as appEnv } from "@/shared/config/env";
import { RendererUnavailableError } from "@/shared/ports";

import { BadRequestError, readJson, toErrorResponse } from "../../../../../tree-http";

/**
 * Compila uma questão.
 *
 * O Route Handler só traduz HTTP: resolve a questão, escolhe o perfil e chama o caso de uso. A
 * regra de cache, a ordem de gravação e o formato do bundle vivem no domínio — este arquivo não é
 * lugar de decidir nada disso.
 *
 * **Não há fila.** A compilação acontece na requisição, e um cache hit volta em milissegundos. Um
 * job de verdade leva um a três segundos, que é menos do que custaria manter estado de fila,
 * expiração e um segundo caminho de erro.
 */
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ questionId: string }> },
) {
  const { questionId } = await params;

  try {
    const env = appEnv();
    if (env.rendererBaseUrl === null || env.rendererSecret === null) {
      // Não configurado é diferente de fora do ar, e a mensagem precisa dizer qual dos dois — a
      // primeira se resolve editando `.env.local`, a segunda subindo o contêiner.
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

    const question = await loadQuestionForRender(questionId);
    if (question === null) {
      return NextResponse.json(
        { error: "not_found", message: `Questão ${questionId} não existe.` },
        { status: 404 },
      );
    }

    const bundle = buildRenderBundle({
      // O `jobId` é da execução e **não** entra no hash de cache — ver `content-hash.ts`.
      jobId: crypto.randomUUID(),
      question: question.question,
      profile,
      ...(body["includeSolution"] === true ? { includeSolution: true } : {}),
    });

    const { job, cacheHit } = await executeRender(
      { workspaceId: question.workspaceId, questionId, bundle },
      {
        executor: new RenderWorkerExecutor({
          baseUrl: env.rendererBaseUrl,
          secret: env.rendererSecret,
        }),
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
      // As chaves de storage **não** vão para o cliente: são opacas e do servidor. O browser pede
      // o artefato pela rota de download, que resolve a chave do lado de cá.
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
      // 503 e não 500: é indisponibilidade temporária, e a mensagem já diz que o texto está salvo.
      return NextResponse.json(
        { error: "renderer_unavailable", message: error.message },
        { status: 503 },
      );
    }
    return toErrorResponse(error);
  }
}

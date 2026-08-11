import { NextResponse } from "next/server";

import { executeRender } from "@modules/rendering/application/execute-render";
import { buildRenderBundle, buildSourceMap } from "@modules/rendering/domain/build-render-bundle";
import { profileById, QUESTION_PREVIEW_PROFILE } from "@modules/rendering/domain/latex-profile";
import { loadQuestionAssets } from "@modules/rendering/infrastructure/prisma-question-assets";
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

    const executor = new RenderWorkerExecutor({
      baseUrl: env.rendererBaseUrl,
      secret: env.rendererSecret,
    });

    const bundleInput = {
      // O `jobId` é da execução e **não** entra no hash de cache — ver `content-hash.ts`.
      jobId: crypto.randomUUID(),
      question: question.question,
      profile,
      ...(body["includeSolution"] === true ? { includeSolution: true } : {}),
    };

    const storage = new LocalFileStorageProvider({ rootDir: env.storageRoot });

    // Duas passagens de propósito: o corpo primeiro, os assets depois. Só o que o LaTeX **cita**
    // viaja, e para saber o que ele cita é preciso já ter o corpo montado. Mandar tudo engordaria
    // cada compilação com arquivos que o documento não usa — e o PDF de origem de um recorte tem
    // megabytes.
    const semAssets = buildRenderBundle(bundleInput);
    const assets = await loadQuestionAssets(questionId, semAssets.sourceLatex, storage);

    const bundle = buildRenderBundle({ ...bundleInput, assets: assets.manifest });

    // Quando o browser desiste — outra compilação foi pedida por cima desta —, o worker precisa
    // saber. Desistir só do lado de cá deixaria o `pdflatex` rodando até o fim para produzir algo
    // que ninguém vai ler, atrasando o pedido que **substituiu** este.
    //
    // `once`: o handler termina de qualquer jeito, e um listener por requisição que nunca sai
    // vazaria memória num servidor que atende milhares.
    request.signal.addEventListener("abort", () => void executor.cancel(bundle.jobId), {
      once: true,
    });

    const { job, cacheHit } = await executeRender(
      { workspaceId: question.workspaceId, questionId, bundle, assets: assets.bytes },
      {
        executor,
        storage,
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
      // O log cru. Ele já era guardado (truncado pelo meio) desde a Fase 6 e **nunca saía daqui**:
      // a aba Log existia, renderizava e dizia "sem log para esta compilação" em toda compilação.
      stdout: job.stdout,
      // O corpo que foi realmente enviado, e não uma reconstrução do cliente. A aba Fonte mostrava
      // só o enunciado, sem as alternativas — dizendo, no cabeçalho, que era o corpo enviado.
      sourceLatex: bundle.sourceLatex,
      // O mapa que traduz a linha do diagnóstico em campo do editor. Vai do servidor porque é o
      // servidor quem monta o corpo; recalculá-lo no cliente seria a mesma regra em dois lugares.
      sourceMap: buildSourceMap(bundleInput),
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

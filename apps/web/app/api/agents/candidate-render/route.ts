import { NextResponse } from "next/server";

import { buildRenderBundle } from "@modules/rendering/domain/build-render-bundle";
import { QUESTION_PREVIEW_PROFILE } from "@modules/rendering/domain/latex-profile";
import { loadQuestionForRender } from "@modules/rendering/infrastructure/prisma-question-render-source";
import { RenderWorkerExecutor } from "@modules/rendering/infrastructure/render-worker-executor";
import { env as appEnv } from "@/shared/config/env";
import { RendererUnavailableError } from "@/shared/ports";

import { BadRequestError, readJson, toErrorResponse } from "../../tree-http";

/**
 * Compila um candidato para a **tela** — o "antes" e o "depois" da revisão.
 *
 * Mesmo caminho isolado da tool do agente: nada de `RenderJob`, nada de storage. A imagem volta
 * embutida na resposta e morre quando a aba fecha, que é exatamente o tempo de vida certo para
 * uma prévia de algo que ainda não foi aprovado. Persistir render de proposta encheria o banco de
 * artefatos de mudanças que talvez sejam rejeitadas.
 *
 * Ver spec §35 · issue #105.
 */
export const dynamic = "force-dynamic";

const FIELDS = new Set(["statementLatex", "solutionLatex", "complementLatex"]);

export async function POST(request: Request) {
  try {
    const env = appEnv();
    if (env.rendererBaseUrl === null || env.rendererSecret === null) {
      return NextResponse.json(
        {
          error: "renderer_not_configured",
          message: "O worker de render não está configurado — suba com `docker compose up -d`.",
        },
        { status: 503 },
      );
    }

    const body = await readJson(request);

    const questionId = body["questionId"];
    const field = body["field"];
    const value = body["value"];

    if (typeof questionId !== "string" || questionId === "") {
      throw new BadRequestError("`questionId` é obrigatório.");
    }
    if (typeof field !== "string" || !FIELDS.has(field)) {
      throw new BadRequestError("`field` precisa ser um dos campos de texto da questão.");
    }
    if (typeof value !== "string" || value.length > 200_000) {
      throw new BadRequestError("`value` precisa ser o LaTeX a compilar.");
    }

    const loaded = await loadQuestionForRender(questionId);
    if (loaded === null) {
      return NextResponse.json(
        { error: "question_not_found", message: "A questão não existe." },
        { status: 404 },
      );
    }

    const bundle = buildRenderBundle({
      jobId: `preview-${field}`,
      question: { ...loaded.question, [field]: value },
      profile: QUESTION_PREVIEW_PROFILE,
      includeSolution: field !== "statementLatex",
    });

    const executor = new RenderWorkerExecutor({
      baseUrl: env.rendererBaseUrl,
      secret: env.rendererSecret,
    });

    const { result, artifacts } = await executor.render(bundle, new Map());

    // A primeira página basta: a prévia é de um recorte de questão, e uma segunda página aqui
    // significaria que o candidato quebrou o `standalone` — o que os diagnósticos já contam.
    const first = result.png[0];
    const bytes = first ? artifacts.get(first.name) : undefined;

    return NextResponse.json({
      success: result.success,
      durationMs: result.durationMs,
      diagnostics: result.diagnostics.filter((entry) => entry.severity !== "info"),
      // Data URI: a imagem existe enquanto a aba estiver aberta, que é o tempo de vida certo para
      // a prévia de algo que ainda não foi aprovado.
      png: bytes ? `data:image/png;base64,${Buffer.from(bytes).toString("base64")}` : null,
    });
  } catch (error) {
    if (error instanceof RendererUnavailableError) {
      return NextResponse.json(
        { error: "renderer_unavailable", message: error.message },
        { status: 503 },
      );
    }
    return toErrorResponse(error);
  }
}

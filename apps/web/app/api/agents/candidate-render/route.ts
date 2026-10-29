import { NextResponse } from "next/server";

import { compileDraft } from "@modules/rendering/application/render-document";
import { QUESTION_PREVIEW_PROFILE } from "@modules/rendering/domain/latex-profile";
import { isLatexField } from "@modules/rendering/domain/render-source";
import { questionRenderSource } from "@modules/rendering/infrastructure/prisma-question-render-source";
import { renderWiringFromEnv } from "@modules/rendering/infrastructure/render-wiring";

import { rendererNotConfigured, renderErrorResponse } from "../../render-http";
import { BadRequestError, readJson } from "../../tree-http";

/**
 * Compila um candidato para a **tela** — o "antes" e o "depois" da revisão.
 *
 * Mesmo caminho da tool do agente (`compileDraft`): nada de `RenderJob`, nada de storage, e as
 * figuras que a questão cita viajam junto — sem elas, toda questão com `\includegraphics` voltava
 * "File not found" nos dois lados, e o diff parecia quebrar a questão. A imagem volta embutida na
 * resposta e morre quando a aba fecha, que é exatamente o tempo de vida certo para uma prévia de
 * algo que ainda não foi aprovado.
 *
 * Ver spec §35 · issue #105 · issue #265.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const wiring = renderWiringFromEnv();
    if (wiring === null) return rendererNotConfigured();

    const body = await readJson(request);

    const questionId = body["questionId"];
    const field = body["field"];
    const value = body["value"];

    if (typeof questionId !== "string" || questionId === "") {
      throw new BadRequestError("`questionId` é obrigatório.");
    }
    if (!isLatexField(field)) {
      throw new BadRequestError("`field` precisa ser um dos campos de texto da questão.");
    }
    if (typeof value !== "string" || value.length > 200_000) {
      throw new BadRequestError("`value` precisa ser o LaTeX a compilar.");
    }

    const source = await questionRenderSource(questionId, wiring.storage);
    if (source === null) {
      return NextResponse.json(
        { error: "question_not_found", message: "A questão não existe." },
        { status: 404 },
      );
    }

    const { result, artifacts } = await compileDraft(wiring, source, {
      profile: QUESTION_PREVIEW_PROFILE,
      overrides: { [field]: value },
      includeSolution: field !== "statementLatex",
      signal: request.signal,
    });

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
    return renderErrorResponse(error);
  }
}

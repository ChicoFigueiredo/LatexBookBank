import { NextResponse } from "next/server";

import type { RenderDocumentResult } from "@modules/rendering/application/render-document";
import { profileById, QUESTION_PREVIEW_PROFILE } from "@modules/rendering/domain/latex-profile";
import { RENDERER_NOT_CONFIGURED_MESSAGE } from "@modules/rendering/infrastructure/render-wiring";
import { RendererUnavailableError, type RenderProfile } from "@/shared/ports";

import { BadRequestError, toErrorResponse } from "./tree-http";

/**
 * O HTTP das rotas de render, num lugar só.
 *
 * A guarda de "worker não configurado", o perfil, o DTO do job e o 503 de worker fora do ar se
 * repetiam nas rotas da questão, do nó e do candidato — e as mensagens já tinham divergido.
 */

export const rendererNotConfigured = (): NextResponse =>
  NextResponse.json(
    { error: "renderer_not_configured", message: RENDERER_NOT_CONFIGURED_MESSAGE },
    { status: 503 },
  );

/** O perfil pedido, ou o de preview quando o corpo não diz. */
export function parseRenderProfile(body: Record<string, unknown>): RenderProfile {
  const profileId = body["profileId"];
  if (profileId === undefined) return QUESTION_PREVIEW_PROFILE;
  if (typeof profileId !== "string") throw new BadRequestError("`profileId` precisa ser texto.");

  const profile = profileById(profileId);
  if (profile === null) throw new BadRequestError(`Perfil \`${profileId}\` não existe.`);
  return profile;
}

/** O job compilado (ou do cache), na forma que o painel de render lê. */
export function renderJobResponse({ job, cacheHit, sourceLatex, sourceMap }: RenderDocumentResult) {
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
    // O corpo que foi realmente enviado, e não uma reconstrução do cliente.
    sourceLatex,
    // O mapa que traduz a linha do diagnóstico em campo do editor. Vai do servidor porque é o
    // servidor quem monta o corpo; recalculá-lo no cliente seria a mesma regra em dois lugares.
    sourceMap,
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
}

/** 503 e não 500 quando o worker não respondeu: é indisponibilidade, e o texto está salvo. */
export function renderErrorResponse(error: unknown): NextResponse {
  if (error instanceof RendererUnavailableError) {
    return NextResponse.json(
      { error: "renderer_unavailable", message: error.message },
      { status: 503 },
    );
  }
  return toErrorResponse(error);
}

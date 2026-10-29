import { NextResponse } from "next/server";

import { PrismaNodeBodyRepository } from "@modules/document-tree/infrastructure/prisma-node-body";
import { renderDocument } from "@modules/rendering/application/render-document";
import { nodeRenderSource } from "@modules/rendering/infrastructure/prisma-question-render-source";
import { renderWiringFromEnv } from "@modules/rendering/infrastructure/render-wiring";

import {
  parseRenderProfile,
  renderErrorResponse,
  renderJobResponse,
  rendererNotConfigured,
} from "../../../../../render-http";
import { readJson } from "../../../../../tree-http";

/**
 * Compila o corpo de um nó (ADR 0001: "um capítulo com corpo é compilável").
 *
 * O mesmo caso de uso e o mesmo cache por hash da questão: o corpo entra no documento no lugar do
 * enunciado, sem alternativas nem resolução, e as figuras que ele cita são as do livro (D58). É o
 * `RenderJob` sem questão — a coluna já era anulável.
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

    const wiring = renderWiringFromEnv();
    if (wiring === null) return rendererNotConfigured();

    const body = await readJson(request).catch(() => ({}) as Record<string, unknown>);
    const profile = parseRenderProfile(body);

    const workspaceId = await repository.workspaceOf(id);
    if (!workspaceId) {
      return NextResponse.json({ error: "not_found", message: "Livro não encontrado." }, { status: 404 });
    }

    const rendered = await renderDocument(
      wiring,
      nodeRenderSource(node, { id, workspaceId }, wiring.storage),
      { profile, signal: request.signal, ...(body["force"] === true ? { force: true } : {}) },
    );

    return renderJobResponse(rendered);
  } catch (error) {
    return renderErrorResponse(error);
  }
}

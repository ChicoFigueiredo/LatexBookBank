import { NextResponse } from "next/server";

import { requireQuestionScope } from "@/shared/authorization/question-scope";

import { renderDocument } from "@modules/rendering/application/render-document";
import { questionRenderSource } from "@modules/rendering/infrastructure/prisma-question-render-source";
import { renderWiringFromEnv } from "@modules/rendering/infrastructure/render-wiring";

import {
  parseRenderProfile,
  rendererNotConfigured,
  renderJobResponse,
} from "../../../../../render-http";
import { toErrorResponse } from "../../../../../http";
import { readJson } from "../../../../../http";

/**
 * Compila uma questão.
 *
 * O Route Handler só traduz HTTP: confere o escopo, escolhe o perfil e chama o caso de uso. A
 * regra de cache, as figuras que viajam e a ordem de gravação vivem em `renderDocument` — este
 * arquivo não é lugar de decidir nada disso.
 *
 * **Não há fila.** A compilação acontece na requisição, e um cache hit volta em milissegundos. Um
 * job de verdade leva um a três segundos, que é menos do que custaria manter estado de fila,
 * expiração e um segundo caminho de erro.
 */
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; questionId: string }> },
) {
  const { id, questionId } = await params;

  try {
    const escopo = await requireQuestionScope(id, questionId);

    const wiring = renderWiringFromEnv();
    if (wiring === null) return rendererNotConfigured();

    const body = await readJson(request).catch(() => ({}) as Record<string, unknown>);
    const profile = parseRenderProfile(body);

    const source = await questionRenderSource(questionId, wiring.storage);
    if (source === null) {
      return NextResponse.json(
        { error: "not_found", message: `Questão ${questionId} não existe.` },
        { status: 404 },
      );
    }

    const rendered = await renderDocument(
      wiring,
      // O workspace vem do **guarda**, não de uma segunda leitura: ele já subiu a cadeia
      // questão → nó → publicação para conferir a URL, e duas resoluções da mesma coisa é onde as
      // duas versões um dia divergem.
      { ...source, workspaceId: escopo.workspaceId },
      {
        profile,
        ...(body["includeSolution"] === true ? { includeSolution: true } : {}),
        // Recompilar de verdade, sem ler o cache — e o resultado novo passa a ser o cache.
        ...(body["force"] === true ? { force: true } : {}),
        signal: request.signal,
      },
    );

    return renderJobResponse(rendered);
  } catch (error) {
    return toErrorResponse(error);
  }
}

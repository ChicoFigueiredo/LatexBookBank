import { NextResponse } from "next/server";

import { originActions } from "@modules/assets/domain/provenance";
import { PrismaProvenanceReader } from "@modules/assets/infrastructure/prisma-provenance-reader";

import { toErrorResponse } from "../../../tree-http";

/**
 * De onde esta questão veio: fonte → página → recorte.
 *
 * As ações vêm junto, calculadas no domínio, porque cada uma **depende do que a fonte é**: abrir
 * na página só faz sentido num PDF, e reconhecer de novo só faz sentido se o recorte ainda
 * existe. Deixar essa decisão para a tela daria botões que falham quando clicados.
 *
 * Questão sem âncora devolve 200 com `null`, e não 404: não ter origem registrada é o estado
 * normal de tudo que foi digitado à mão, e um erro ali faria a aba parecer quebrada.
 *
 * Ver spec §18 · issue #137.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ questionId: string }> },
) {
  try {
    const { questionId } = await params;

    const provenance = await new PrismaProvenanceReader().findByQuestionId(questionId);
    if (provenance === null) return NextResponse.json({ provenance: null, actions: [] });

    return NextResponse.json({ provenance, actions: originActions(provenance) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

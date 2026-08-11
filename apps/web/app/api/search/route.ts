import { NextResponse } from "next/server";

import { normalizeQuery } from "@modules/questions/domain/search-query";
import { PrismaQuestionSearch } from "@modules/questions/infrastructure/prisma-question-search";

import { toErrorResponse } from "../tree-http";

/**
 * Busca no acervo.
 *
 * `GET` e não `POST`: uma busca é idempotente e vale a pena ser compartilhável por URL — copiar o
 * endereço de "todas as questões da FGV de 2024 com a tag juros" é exatamente o gesto que alguém
 * quer ao montar uma prova.
 *
 * Nada é recusado. Um filtro inválido é descartado e os outros valem — busca é exploratória, e
 * devolver 400 no meio de uma digitação seria hostil.
 *
 * Ver spec §12 · issue #113.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;

    const query = normalizeQuery({
      text: params.get("q") ?? "",
      tags: params.getAll("tag"),
      boards: params.getAll("board"),
      institutions: params.getAll("institution"),
      years: params.getAll("year"),
      types: params.getAll("type"),
      difficulties: params.getAll("difficulty"),
      limit: params.get("limit") ?? undefined,
      offset: params.get("offset") ?? undefined,
    });

    return NextResponse.json(await new PrismaQuestionSearch().search(query));
  } catch (error) {
    return toErrorResponse(error);
  }
}

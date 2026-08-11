import { NextResponse } from "next/server";

import { rankSuggestions } from "@modules/questions/domain/tag";
import { PrismaTagRepository } from "@modules/questions/infrastructure/prisma-tag-repository";

import { toErrorResponse } from "../../../tree-http";

/**
 * As tags do workspace, para o autocomplete.
 *
 * Por workspace e não global: são 13 bibliotecas, e sugerir a tag de uma na outra misturaria
 * acervos que existem separados de propósito.
 *
 * A ordenação é de `rankSuggestions` — por **uso**, não por alfabeto. Num acervo de milhares de
 * questões as dez mais usadas cobrem a maioria dos casos, e a ordem alfabética as esconderia
 * atrás de qualquer coisa que comece com "a".
 *
 * Ver spec §33 · issue #141.
 */
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;

  try {
    const query = new URL(request.url).searchParams.get("q") ?? "";
    const all = await new PrismaTagRepository().listTags(workspaceId);

    return NextResponse.json({ tags: rankSuggestions(all, query) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

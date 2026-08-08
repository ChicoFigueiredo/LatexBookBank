import { NextResponse } from "next/server";

import { addOption } from "@modules/questions/application/mutate-options";
import { PrismaOptionWriter } from "@modules/questions/infrastructure/prisma-option-writer";

import { readJson, toErrorResponse } from "../../../../../tree-http";

/**
 * Cria uma alternativa.
 *
 * O corpo é opcional: a pessoa clica em "adicionar" e digita depois, que é o gesto real. Exigir
 * texto aqui obrigaria a interface a abrir um diálogo para uma linha em branco.
 */
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ questionId: string }> },
) {
  const { questionId } = await params;

  try {
    const body = await readJson(request).catch(() => ({}) as Record<string, unknown>);
    const statementLatex = typeof body["statementLatex"] === "string" ? body["statementLatex"] : "";

    const option = await addOption(new PrismaOptionWriter(), questionId, statementLatex);
    return NextResponse.json(option, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

import { NextResponse } from "next/server";

import { resolveQuestionScope } from "@/shared/authorization/question-scope";

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

/**
 * Lista as alternativas com `id` e `sortKey`.
 *
 * O DTO da árvore carrega só o que a árvore desenha — texto e gabarito. Editar precisa de
 * identidade e de ordem, e engordar o DTO com isso faria **toda** abertura de publicação pagar
 * por um painel que só abre quando alguém clica na aba. É a mesma decisão do histórico.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; questionId: string }> },
) {
  const { id, questionId } = await params;

  try {
    const escopo = await resolveQuestionScope(id, questionId);
    if (escopo === null) {
      // 404 e não 403: distinguir "existe, mas não é desta publicação" de "não existe" confirmaria
      // a quem perguntou que o id acertou — que é a informação que um enumerador procura.
      return NextResponse.json(
        {
          error: "not_found",
          message: `Questão ${questionId} não existe nesta publicação.`,
        },
        { status: 404 },
      );
    }

    const options = await new PrismaOptionWriter().listOptions(questionId);
    return NextResponse.json({ options });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; questionId: string }> },
) {
  const { id, questionId } = await params;

  try {
    const escopo = await resolveQuestionScope(id, questionId);
    if (escopo === null) {
      // 404 e não 403: distinguir "existe, mas não é desta publicação" de "não existe" confirmaria
      // a quem perguntou que o id acertou — que é a informação que um enumerador procura.
      return NextResponse.json(
        {
          error: "not_found",
          message: `Questão ${questionId} não existe nesta publicação.`,
        },
        { status: 404 },
      );
    }

    const body = await readJson(request).catch(() => ({}) as Record<string, unknown>);
    const statementLatex = typeof body["statementLatex"] === "string" ? body["statementLatex"] : "";

    const option = await addOption(new PrismaOptionWriter(), questionId, statementLatex);
    return NextResponse.json(option, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

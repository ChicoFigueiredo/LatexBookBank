import { NextResponse } from "next/server";

import { requireQuestionScope } from "@/shared/authorization/question-scope";

import { editOption, removeOption } from "@modules/questions/application/mutate-options";
import { PrismaOptionWriter } from "@modules/questions/infrastructure/prisma-option-writer";
import { PrismaValidationWriter } from "@modules/questions/infrastructure/prisma-validation-writer";

import { readJson, toErrorResponse } from "../../../../../../http";

/**
 * Muda uma alternativa: posição, gabarito ou texto.
 *
 * Três operações num `PATCH` só porque são três campos do mesmo recurso — e porque arrastar
 * enquanto se digita é comum, e três rotas separadas dariam três caminhos de erro para o mesmo
 * gesto. O corpo diz qual delas é.
 */
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; questionId: string; optionId: string }> },
) {
  const { id, questionId, optionId } = await params;

  try {
    await requireQuestionScope(id, questionId);

    const body = await readJson(request);

    // `isCorrect: true` marca; o domínio decide se isso desmarca as outras, conforme o tipo.
    // Não há "desmarcar" na API de propósito: deixar a questão sem gabarito é resultado de
    // remover ou de marcar outra, nunca um pedido explícito que a interface precise oferecer.
    // O caso de uso confere o pedido inteiro antes de gravar, grava numa transação e revalida.
    await editOption(
      new PrismaOptionWriter(),
      questionId,
      optionId,
      {
        targetIndex: body["targetIndex"],
        isCorrect: body["isCorrect"],
        statementLatex: body["statementLatex"],
      },
      new PrismaValidationWriter(),
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; questionId: string; optionId: string }> },
) {
  const { id, questionId, optionId } = await params;

  try {
    await requireQuestionScope(id, questionId);

    await removeOption(
      new PrismaOptionWriter(),
      questionId,
      optionId,
      new PrismaValidationWriter(),
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

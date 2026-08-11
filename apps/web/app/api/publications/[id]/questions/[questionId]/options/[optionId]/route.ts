import { NextResponse } from "next/server";

import { resolveQuestionScope } from "@/shared/authorization/question-scope";

import {
  moveOption,
  QuestionNotFoundError,
  removeOption,
  setCorrectOption,
} from "@modules/questions/application/mutate-options";
import { OptionNotFoundError } from "@modules/questions/domain/option-mutations";
import { PrismaOptionWriter } from "@modules/questions/infrastructure/prisma-option-writer";

import { BadRequestError, readJson, toErrorResponse } from "../../../../../../tree-http";

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

    const body = await readJson(request);
    const writer = new PrismaOptionWriter();

    if (body["targetIndex"] !== undefined) {
      const index = body["targetIndex"];
      if (typeof index !== "number" || !Number.isInteger(index)) {
        throw new BadRequestError("`targetIndex` precisa ser inteiro.");
      }
      await moveOption(writer, questionId, optionId, index);
    }

    // `isCorrect: true` marca; o domínio decide se isso desmarca as outras, conforme o tipo.
    // Não há "desmarcar" na API de propósito: deixar a questão sem gabarito é resultado de
    // remover ou de marcar outra, nunca um pedido explícito que a interface precise oferecer.
    if (body["isCorrect"] === true) {
      await setCorrectOption(writer, questionId, optionId);
    }

    if (body["statementLatex"] !== undefined) {
      const text = body["statementLatex"];
      if (typeof text !== "string")
        throw new BadRequestError("`statementLatex` precisa ser texto.");
      await writer.updateText(questionId, optionId, text);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof OptionNotFoundError || error instanceof QuestionNotFoundError) {
      return NextResponse.json({ error: "not_found", message: error.message }, { status: 404 });
    }
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; questionId: string; optionId: string }> },
) {
  const { id, questionId, optionId } = await params;

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

    await removeOption(new PrismaOptionWriter(), questionId, optionId);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof OptionNotFoundError) {
      return NextResponse.json({ error: "not_found", message: error.message }, { status: 404 });
    }
    return toErrorResponse(error);
  }
}

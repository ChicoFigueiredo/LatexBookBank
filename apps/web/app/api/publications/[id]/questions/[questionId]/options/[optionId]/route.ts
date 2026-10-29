import { NextResponse } from "next/server";

import { resolveQuestionScope } from "@/shared/authorization/question-scope";

import {
  editOption,
  QuestionNotFoundError,
  removeOption,
} from "@modules/questions/application/mutate-options";
import {
  InvalidOptionEditError,
  OptionNotFoundError,
} from "@modules/questions/domain/option-mutations";
import { PrismaOptionWriter } from "@modules/questions/infrastructure/prisma-option-writer";
import { PrismaValidationWriter } from "@modules/questions/infrastructure/prisma-validation-writer";

import { readJson, toErrorResponse } from "../../../../../../tree-http";

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
    if (error instanceof OptionNotFoundError || error instanceof QuestionNotFoundError) {
      return NextResponse.json({ error: "not_found", message: error.message }, { status: 404 });
    }
    if (error instanceof InvalidOptionEditError) {
      return NextResponse.json({ error: "bad_request", message: error.message }, { status: 400 });
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

    await removeOption(
      new PrismaOptionWriter(),
      questionId,
      optionId,
      new PrismaValidationWriter(),
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof OptionNotFoundError) {
      return NextResponse.json({ error: "not_found", message: error.message }, { status: 404 });
    }
    return toErrorResponse(error);
  }
}

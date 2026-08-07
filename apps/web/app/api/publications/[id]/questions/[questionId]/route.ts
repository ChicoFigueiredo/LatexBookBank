import { NextResponse } from "next/server";

import { QuestionNotFoundError, saveQuestion } from "@modules/questions/application/save-question";
import { PrismaQuestionRepository } from "@modules/questions/infrastructure/prisma-question-repository";
import { ConcurrencyConflictError } from "@/shared/ports/repository";

import { BadRequestError, readJson, toErrorResponse } from "../../../../tree-http";

/**
 * Salva o conteúdo de uma questão.
 *
 * O cliente manda o `updatedAt` que tinha ao começar a editar. Se a linha mudou desde então, a
 * resposta é **409 com os dois lados** — a versão esperada e a encontrada —, nunca um 200 que
 * apagou o trabalho de outro processo (spec §42).
 */
export const dynamic = "force-dynamic";

const LATEX_LIMIT = 200_000;

function parseLatex(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new BadRequestError(`\`${field}\` precisa ser texto.`);
  if (value.length > LATEX_LIMIT) {
    throw new BadRequestError(`\`${field}\` passa de ${LATEX_LIMIT} caracteres.`);
  }
  return value;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ questionId: string }> },
) {
  const { questionId } = await params;

  try {
    const body = await readJson(request);

    const expected = body["expectedUpdatedAt"];
    if (typeof expected !== "string") {
      throw new BadRequestError("`expectedUpdatedAt` é obrigatório (ISO-8601).");
    }
    const expectedUpdatedAt = new Date(expected);
    if (Number.isNaN(expectedUpdatedAt.getTime())) {
      throw new BadRequestError("`expectedUpdatedAt` não é uma data ISO-8601 válida.");
    }

    const nickname = body["nickname"];
    if (nickname !== undefined && nickname !== null && typeof nickname !== "string") {
      throw new BadRequestError("`nickname` precisa ser texto ou nulo.");
    }

    const result = await saveQuestion(new PrismaQuestionRepository(), {
      questionId,
      expectedUpdatedAt,
      edit: {
        ...(parseLatex(body["statementLatex"], "statementLatex") !== undefined
          ? { statementLatex: parseLatex(body["statementLatex"], "statementLatex") as string }
          : {}),
        ...(parseLatex(body["solutionLatex"], "solutionLatex") !== undefined
          ? { solutionLatex: parseLatex(body["solutionLatex"], "solutionLatex") as string }
          : {}),
        ...(parseLatex(body["complementLatex"], "complementLatex") !== undefined
          ? { complementLatex: parseLatex(body["complementLatex"], "complementLatex") as string }
          : {}),
        ...(nickname !== undefined ? { nickname: nickname as string | null } : {}),
      },
    });

    return NextResponse.json({
      id: result.snapshot.id,
      updatedAt: result.snapshot.updatedAt.toISOString(),
      // O cliente precisa saber se houve escrita: sem isto, o indicador de "salvo" piscaria a
      // cada autosave mesmo sem nada ter mudado, e viraria ruído que ninguém mais lê.
      written: result.written,
    });
  } catch (error) {
    if (error instanceof QuestionNotFoundError) {
      return NextResponse.json({ error: "not_found", message: error.message }, { status: 404 });
    }
    if (error instanceof ConcurrencyConflictError) {
      return NextResponse.json(
        {
          error: "conflict",
          message:
            "Esta questão mudou desde que você abriu. Recarregue para ver a versão atual antes de salvar.",
          expectedUpdatedAt: String(error.expectedVersion),
          actualUpdatedAt: String(error.actualVersion),
        },
        { status: 409 },
      );
    }
    return toErrorResponse(error);
  }
}

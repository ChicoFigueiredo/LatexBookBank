import { NextResponse } from "next/server";

import {
  addQuestion,
  removeQuestion,
} from "@modules/assessments/infrastructure/prisma-assessment-repository";

import { BadRequestError, readJson, toErrorResponse } from "../../../tree-http";

/**
 * Acrescenta ou tira uma questão da prova.
 *
 * Referência, nunca cópia: tirar da prova não toca na questão, e corrigir a questão corrige em
 * todas as provas que a usam.
 *
 * Ver spec §20 · issue #143.
 */
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ assessmentId: string }> },
) {
  const { assessmentId } = await params;

  try {
    const body = await readJson(request);
    const questionId = body["questionId"];
    if (typeof questionId !== "string" || questionId === "") {
      throw new BadRequestError("`questionId` é obrigatório.");
    }

    const result = await addQuestion(assessmentId, questionId);

    if (!result.added && result.reason === "foreign") {
      // 400 e não 200: uma questão de **outra biblioteca** numa prova daqui é engano, e ele custa
      // caro depois — `AssessmentItem → Question` é `onDelete: Restrict`, então a prova passa a
      // travar a exclusão de uma questão que não é dela, num acervo onde ela nem aparece (#177).
      return NextResponse.json(
        {
          error: "question_from_another_workspace",
          message: "Esta questão é de outra biblioteca. Uma prova só monta com o acervo dela.",
        },
        { status: 400 },
      );
    }

    // `200 added:false` e não erro: clicar duas vezes em "acrescentar" é gesto, não engano, e o
    // schema já garante que a mesma questão não entra duas vezes.
    return NextResponse.json(result, { status: result.added ? 201 : 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ assessmentId: string }> },
) {
  const { assessmentId } = await params;

  try {
    const questionId = new URL(request.url).searchParams.get("questionId");
    if (questionId === null || questionId === "") {
      throw new BadRequestError("`questionId` é obrigatório.");
    }

    await removeQuestion(assessmentId, questionId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

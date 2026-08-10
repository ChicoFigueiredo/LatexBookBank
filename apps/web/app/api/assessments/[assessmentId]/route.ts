import { NextResponse } from "next/server";

import {
  contentFor,
  findAssessment,
} from "@modules/assessments/infrastructure/prisma-assessment-repository";

import { toErrorResponse } from "../../tree-http";

/**
 * A avaliação com suas questões.
 *
 * O enunciado vai junto, cortado: a tela precisa dizer **qual** questão está na prova, e um id
 * não diz. O corte é aqui e não no cliente porque enunciado de matemática tem LaTeX inteiro
 * dentro, e mandar tudo para mostrar oitenta caracteres é pagar o acervo por linha de lista.
 *
 * Ver spec §20 · issue #143.
 */
export const dynamic = "force-dynamic";

const EXCERPT = 160;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assessmentId: string }> },
) {
  const { assessmentId } = await params;

  try {
    const assessment = await findAssessment(assessmentId);
    if (assessment === null) {
      return NextResponse.json(
        { error: "not_found", message: "Esta avaliação não existe." },
        { status: 404 },
      );
    }

    const content = await contentFor(assessment.items.map((item) => item.questionId));

    return NextResponse.json({
      id: assessment.id,
      title: assessment.title,
      subtitle: assessment.subtitle,
      notes: assessment.notes,
      items: assessment.items.map((item) => {
        const question = content[item.questionId];

        return {
          questionId: item.questionId,
          excerpt: (question?.statementLatex ?? "").slice(0, EXCERPT),
          optionCount: Object.keys(question?.options ?? {}).length,
          // Sem correta marcada, a prova sai — mas o gabarito daquela questão fica em branco, e
          // quem monta precisa ver isso **antes** de imprimir.
          hasCorrect: question?.correctOptionId != null,
        };
      }),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

import { NextResponse } from "next/server";

import {
  contentFor,
  deleteAssessment,
  findAssessment,
  variantLabelsOf,
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

/**
 * Apaga a avaliação.
 *
 * Existia o gesto de criar e não o de apagar, então toda prova montada — inclusive as de teste —
 * ficava na lista para sempre. Em desenvolvimento isso é lixo; num acervo de verdade é pior, porque
 * a lista deixa de dizer quais provas importam.
 *
 * **Variante sorteada exige confirmação explícita.** O mapa de letras de uma variante *é* o
 * gabarito de uma prova que pode já ter sido impressa e entregue à turma; apagá-lo destrói a única
 * cópia de como aquela prova foi embaralhada, e a seed sozinha não a reconstrói — ela reproduz a
 * permutação apenas enquanto a questão tiver exatamente as mesmas alternativas (§17).
 *
 * Por isso a recusa vem com **409 e a lista das variantes**, não com um 400 genérico: o pedido é
 * válido, é o estado que exige alguém dizer sim sabendo o que perde.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ assessmentId: string }> },
) {
  const { assessmentId } = await params;

  try {
    const confirmed = new URL(request.url).searchParams.get("confirmVariants") === "1";
    const labels = await variantLabelsOf(assessmentId);

    if (labels === null) {
      return NextResponse.json(
        { error: "not_found", message: "Esta avaliação não existe." },
        { status: 404 },
      );
    }

    if (labels.length > 0 && !confirmed) {
      return NextResponse.json(
        {
          error: "variants_would_be_lost",
          message:
            `Esta avaliação tem ${labels.length} variante(s) sorteada(s) (${labels.join(", ")}). ` +
            "O mapa de letras delas é o gabarito, e apagá-lo não tem volta — a seed sozinha não " +
            "reconstrói a prova se as alternativas mudarem.",
          variantLabels: labels,
        },
        { status: 409 },
      );
    }

    const { variantLabels } = await deleteAssessment(assessmentId);

    return NextResponse.json({ deleted: true, variantLabels });
  } catch (error) {
    return toErrorResponse(error);
  }
}

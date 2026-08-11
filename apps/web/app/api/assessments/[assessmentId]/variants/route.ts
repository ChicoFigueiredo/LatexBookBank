import { NextResponse } from "next/server";

import {
  composeVariant,
  composeVersions,
  EmptyAssessmentError,
  MissingQuestionError,
} from "@modules/assessments/application/compose-assessment";
import {
  contentFor,
  findAssessment,
  saveVariant,
} from "@modules/assessments/infrastructure/prisma-assessment-repository";

import { BadRequestError, readJson, toErrorResponse } from "../../../tree-http";

/**
 * Sorteia uma variante e guarda **o mapa de letras**.
 *
 * O sorteio acontece uma vez e alimenta as três versões. Sortear por versão daria três provas
 * diferentes com o mesmo nome — a do aluno com a resposta em `c`, a do professor com ela em `a` —,
 * que é o pior defeito possível numa prova, porque só aparece na correção.
 *
 * A `seed` vem do cliente quando vem: é o que torna a prova reproduzível, e escondê-la atrás de um
 * sorteio interno tiraria de quem monta a única maneira de repetir a mesma prova amanhã. Sem ela,
 * a hora vira semente — e ela vai gravada, então a reprodução continua possível depois.
 *
 * Ver spec §20 · D9 · issue #143.
 */
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ assessmentId: string }> },
) {
  const { assessmentId } = await params;

  try {
    const body = await readJson(request).catch(() => ({}) as Record<string, unknown>);

    const label = typeof body["label"] === "string" ? body["label"].trim() : "";
    if (label === "") throw new BadRequestError("`label` é obrigatório — é o nome da variante.");

    const rawSeed = body["seed"];
    if (rawSeed !== undefined && (typeof rawSeed !== "number" || !Number.isInteger(rawSeed))) {
      throw new BadRequestError("`seed` precisa ser um inteiro.");
    }
    const seed = rawSeed ?? Date.now() % 2_147_483_647;

    const assessment = await findAssessment(assessmentId);
    if (assessment === null) {
      return NextResponse.json(
        { error: "not_found", message: "Esta avaliação não existe." },
        { status: 404 },
      );
    }

    const spec = {
      label,
      seed,
      shuffleQuestions: body["shuffleQuestions"] !== false,
      shuffleOptions: body["shuffleOptions"] !== false,
    };

    const content = await contentFor(assessment.items.map((item) => item.questionId));
    const variant = composeVariant(assessment, spec, content);
    const versions = composeVersions(assessment, variant, content);

    await saveVariant(assessmentId, variant, spec);

    return NextResponse.json(
      {
        label: variant.label,
        seed: variant.seed,
        // O gabarito vai na resposta porque é o que quem montou precisa conferir antes de
        // imprimir — e ele sai do mapa, não de um novo sorteio.
        answers: versions.answers,
        latex: versions.latexByAudience,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof EmptyAssessmentError || error instanceof MissingQuestionError) {
      return NextResponse.json(
        { error: "cannot_compose", message: error.message },
        { status: 409 },
      );
    }
    return toErrorResponse(error);
  }
}

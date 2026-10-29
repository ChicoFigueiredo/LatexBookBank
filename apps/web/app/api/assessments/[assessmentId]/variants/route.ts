import { NextResponse } from "next/server";

import { drawVariant } from "@modules/assessments/application/manage-assessments";
import { PrismaAssessmentStore } from "@modules/assessments/infrastructure/prisma-assessment-repository";

import { BadRequestError, readJson, toErrorResponse } from "../../../http";

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

/** O maior `Int` do banco. */
const MAX_SEED = 2_147_483_647;

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
    // A seed é `Int` no banco (32 bits com sinal), e o sorteio a lê como `seed >>> 0`: fora de
    // 0…2147483647 ela ou não grava, ou vira outra seed (-1 e 4294967295 dão a mesma prova) (#263).
    if (
      rawSeed !== undefined &&
      (typeof rawSeed !== "number" ||
        !Number.isInteger(rawSeed) ||
        rawSeed < 0 ||
        rawSeed > MAX_SEED)
    ) {
      throw new BadRequestError(`\`seed\` precisa ser um inteiro de 0 a ${MAX_SEED}.`);
    }
    const seed = rawSeed ?? Date.now() % MAX_SEED;

    const spec = {
      label,
      seed,
      shuffleQuestions: body["shuffleQuestions"] !== false,
      shuffleOptions: body["shuffleOptions"] !== false,
    };

    const { variant, versions } = await drawVariant(
      new PrismaAssessmentStore(),
      assessmentId,
      spec,
    );

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
    return toErrorResponse(error);
  }
}

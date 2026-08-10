import { NextResponse } from "next/server";

import {
  QuestionGoneError,
  revertQuestion,
} from "@modules/agents/application/apply-question-patch";
import { PrismaPatchApplier } from "@infrastructure/agent/prisma-patch-applier";
import { findRevision } from "@infrastructure/agent/prisma-revision-reader";

import { BadRequestError, readJson, toErrorResponse } from "../../../tree-http";

/**
 * Volta a questão a uma revisão.
 *
 * O snapshot vem do **banco**, pelo número da revisão — nunca do corpo da requisição. Aceitar um
 * snapshot enviado pelo cliente seria uma escrita arbitrária disfarçada de "desfazer": qualquer
 * estado poderia ser gravado alegando que já existiu.
 *
 * Reverter grava uma revisão do estado atual antes de restaurar, dentro da mesma transação. Sem
 * isso não dá para desfazer o desfazer — que é o que alguém quer quando reverteu por engano.
 *
 * Ver spec §35 · issue #101.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);

    const questionId = requireString(body["questionId"], "questionId");
    const revisionNumber = body["revisionNumber"];
    if (typeof revisionNumber !== "number" || !Number.isInteger(revisionNumber)) {
      throw new BadRequestError("`revisionNumber` precisa ser um inteiro.");
    }

    const revision = await findRevision(questionId, revisionNumber);
    if (revision === null) {
      return NextResponse.json(
        {
          error: "revision_not_found",
          message: `A questão não tem a revisão ${revisionNumber}.`,
        },
        { status: 404 },
      );
    }

    const created = await revertQuestion(new PrismaPatchApplier(), {
      questionId,
      snapshotJson: revision.snapshotJson,
      summary: `Reverte para a revisão ${revisionNumber} (${revision.summary}).`,
    });

    return NextResponse.json({ revisionNumber: created, revertedTo: revisionNumber });
  } catch (error) {
    if (error instanceof QuestionGoneError) {
      return NextResponse.json({ error: "question_gone", message: error.message }, { status: 409 });
    }
    return toErrorResponse(error);
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > 200) {
    throw new BadRequestError(`\`${field}\` é obrigatório e precisa ser um identificador.`);
  }
  return value;
}

import { NextResponse } from "next/server";

import {
  applyQuestionPatch,
  QuestionGoneError,
} from "@modules/agents/application/apply-question-patch";
import { NothingApprovedError } from "@modules/agents/domain/apply-patch";
import { parseQuestionPatch, PatchRejectedError } from "@modules/agents/domain/question-patch";
import { PrismaPatchApplier } from "@infrastructure/agent/prisma-patch-applier";

import { BadRequestError, readJson, toErrorResponse } from "../../../tree-http";

/**
 * Aplica um patch — **só o que o usuário aprovou**.
 *
 * O corpo traz o patch e a lista de linhas aprovadas. O patch é revalidado aqui: ele veio do
 * cliente, e o cliente é uma tela que pode ter sido contornada. A lista de aprovadas é
 * obrigatória e vazia é erro, não "aplicar tudo" — a diferença entre as duas leituras é a
 * diferença entre ter e não ter aprovação explícita.
 *
 * O plano é recalculado do estado corrente dentro da transação. Se a questão mudou desde a
 * proposta, as linhas aprovadas somem e a resposta diz quais.
 *
 * Ver spec §35 · issue #101.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);

    const questionId = requireString(body["questionId"], "questionId");
    const approvedChangeIds = parseApproved(body["approvedChangeIds"]);
    // Revalidado, e não confiado: a whitelist é a única coisa entre o patch e as colunas.
    const patch = parseQuestionPatch(body["patch"]);

    const agentRunId = typeof body["agentRunId"] === "string" ? body["agentRunId"] : null;

    const result = await applyQuestionPatch(new PrismaPatchApplier(), {
      questionId,
      patch,
      approvedChangeIds,
      origin: "AGENT",
      agentRunId,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof NothingApprovedError) {
      return NextResponse.json(
        { error: "nothing_approved", message: error.message },
        { status: 400 },
      );
    }
    if (error instanceof PatchRejectedError) {
      return NextResponse.json(
        { error: "patch_rejected", message: error.message, issues: error.issues },
        { status: 400 },
      );
    }
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

function parseApproved(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    throw new BadRequestError(
      "`approvedChangeIds` é obrigatório: nada é aplicado sem aprovação explícita.",
    );
  }
  if (value.length > 200) throw new BadRequestError("`approvedChangeIds` tem itens demais.");

  return value.map((entry, index) => {
    if (typeof entry !== "string" || entry.length > 200) {
      throw new BadRequestError(`\`approvedChangeIds[${index}]\` precisa ser texto.`);
    }
    return entry;
  });
}

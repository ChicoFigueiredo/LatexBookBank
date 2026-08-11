import { NextResponse } from "next/server";

import { resolveQuestionScope } from "@/shared/authorization/question-scope";
import { validateAndPersist } from "@modules/questions/application/validate-question";
import { buildChecklist, isUsable } from "@modules/questions/domain/validation-checklist";
import {
  PrismaValidationWriter,
  questionForValidation,
} from "@modules/questions/infrastructure/prisma-validation-writer";
import { lastRenderStateOf } from "@modules/rendering/infrastructure/prisma-render-state";

import { toErrorResponse } from "../../../../../tree-http";

/**
 * "Validar questão" — o botão do design §25, e a resposta que faltava.
 *
 * A validação já rodava a cada salvamento e gravava `VALID`/`INVALID`, mas os **problemas** nunca
 * chegavam à tela: a questão ficava vermelha na árvore e o autor tinha que adivinhar o motivo.
 * Esta rota devolve a lista de verificação inteira — o que está certo e o que não está.
 *
 * `POST` e não `GET` porque ela **grava** o veredito: pedir validação é um gesto, e o resultado
 * dele é estado da questão. Sem gravar, o selo da árvore continuaria dizendo o que valia antes.
 */
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; questionId: string }> },
) {
  const { id, questionId } = await params;

  try {
    // O escopo confere que a questão é **desta** publicação — sem isso a rota validaria questão de
    // outro livro por um id adivinhado na URL.
    const scope = await resolveQuestionScope(id, questionId);
    if (scope === null) {
      return NextResponse.json(
        { error: "question_not_found", message: "Esta questão não é desta publicação." },
        { status: 404 },
      );
    }

    const question = await questionForValidation(questionId);
    if (question === null) {
      return NextResponse.json(
        { error: "question_not_found", message: "Questão não encontrada ou de tipo desconhecido." },
        { status: 404 },
      );
    }

    const outcome = await validateAndPersist(new PrismaValidationWriter(), questionId, question);

    const checks = buildChecklist({
      question,
      issues: outcome.issues,
      lastRenderState: await lastRenderStateOf(questionId),
      unsupported: outcome.unsupported,
    });

    return NextResponse.json({ status: outcome.status, usable: isUsable(checks), checks });
  } catch (error) {
    return toErrorResponse(error);
  }
}

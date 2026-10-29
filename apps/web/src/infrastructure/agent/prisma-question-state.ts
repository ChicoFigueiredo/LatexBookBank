import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@infrastructure/database/sqlite/client";
import type { QuestionState } from "@modules/agents/domain/patch-diff";
import type { RevisionOrigin } from "@modules/revisions/domain/revision";
import { appendRevision } from "@modules/revisions/infrastructure/prisma-revision-writer";

/**
 * O estado da questão — o que o diff do agente compara e o que a revisão da questão guarda.
 *
 * Sem `client`, lê **fora** de transação: o diff da proposta é só para mostrar, e mostrar não
 * precisa de bloqueio. Quando o usuário aprovar, o estado é lido outra vez, dentro da transação
 * do aplicador, e o diff é recalculado — é lá que a concorrência importa.
 *
 * Ver spec §35 · issue #103.
 */
export async function readQuestionState(
  questionId: string,
  client: Prisma.TransactionClient = prisma,
): Promise<QuestionState | null> {
  const row = await client.question.findUnique({
    where: { id: questionId },
    select: {
      type: true,
      statementLatex: true,
      solutionLatex: true,
      complementLatex: true,
      nickname: true,
      difficulty: true,
      year: true,
      board: true,
      institution: true,
      role: true,
      roleLevel: true,
      publisher: true,
      videoUrl: true,
      options: {
        orderBy: { sortKey: "asc" },
        select: { id: true, sortKey: true, statementLatex: true, isCorrect: true },
      },
      tags: { select: { tag: { select: { name: true } } } },
    },
  });
  if (!row) return null;

  const {
    type,
    options,
    tags,
    statementLatex,
    solutionLatex,
    complementLatex,
    nickname,
    ...metadata
  } = row;

  return {
    type,
    statementLatex,
    solutionLatex,
    complementLatex,
    nickname,
    options,
    metadata,
    tags: tags.map((link) => link.tag.name),
  };
}

/**
 * A revisão da questão com o estado de agora, lido dentro da transação de quem vai mudá-la.
 *
 * O par de `appendNodeRevision` para a questão: quem muda o enunciado por fora do editor e do
 * agente — a retirada de uma importação (CAP-09) — grava o mesmo `QuestionState` que o Histórico
 * da questão sabe mostrar e restaurar. Devolve `null`, sem gravar nada, quando a questão sumiu.
 */
export async function appendQuestionRevision(
  tx: Prisma.TransactionClient,
  input: {
    readonly questionId: string;
    readonly origin: RevisionOrigin;
    readonly summary: string;
  },
): Promise<number | null> {
  const state = await readQuestionState(input.questionId, tx);
  if (state === null) return null;
  return appendRevision(tx, {
    entityType: "QUESTION",
    entityId: input.questionId,
    origin: input.origin,
    summary: input.summary,
    snapshotJson: JSON.stringify(state),
  });
}

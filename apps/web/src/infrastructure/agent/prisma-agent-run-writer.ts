import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import type { AgentRunRecord } from "@modules/agents/domain/agent-run";

/**
 * Grava o turno para auditoria.
 *
 * Fica em `infrastructure/` e não em `modules/agents/` pelo mesmo motivo da porta de leitura: o
 * lint de boundary proíbe o módulo do agente de alcançar o banco. E aqui a proibição é ainda mais
 * pertinente — este arquivo **escreve**. Que a única escrita do fluxo agêntico esteja fora do
 * módulo do agente, num arquivo que grava log e nada mais, é exatamente o desenho: o agente não
 * tem caminho de escrita; o app registra que ele passou.
 *
 * Ver spec §14 · issue #97.
 */

export interface AgentRunOrigin {
  readonly workspaceId: string;
  readonly questionId: string | null;
}

export async function recordAgentRun(
  origin: AgentRunOrigin,
  record: AgentRunRecord,
): Promise<string> {
  const row = await prisma.agentRun.create({
    data: {
      workspaceId: origin.workspaceId,
      questionId: origin.questionId,
      mode: record.mode,
      providerId: record.providerId,
      model: record.model,
      state: record.state,
      error: record.error ?? null,
      // Resumo, nunca transcrição — o prompt completo carrega o contexto anexado, e log de
      // auditoria não é lugar para enunciado de prova inteiro (spec §14).
      promptSummary: record.promptSummary,
      answerSummary: record.answerSummary,
      toolCallsJson: JSON.stringify(record.toolCalls),
      inputTokens: record.inputTokens ?? null,
      outputTokens: record.outputTokens ?? null,
      durationMs: record.durationMs,
    },
    select: { id: true },
  });

  return row.id;
}

/** O workspace de uma questão: questão → nó → publicação → workspace. */
export async function workspaceOfQuestion(questionId: string): Promise<string | null> {
  const row = await prisma.question.findUnique({
    where: { id: questionId },
    select: { node: { select: { publication: { select: { workspaceId: true } } } } },
  });

  return row?.node?.publication.workspaceId ?? null;
}

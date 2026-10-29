"use client";

import type {
  ApplyPatchResponse,
  AskAgentResponse,
  CandidateRenderResponse,
  RevertPatchResponse,
} from "@modules/agents/application/agent-contract";
import type { ContextItem } from "@modules/agents/domain/agent-context";
import type { AgentMode } from "@modules/agents/domain/agent-run";
import type { QuestionPatch } from "@modules/agents/domain/question-patch";
import type { LatexField } from "@modules/rendering/domain/render-source";
import { readLenientReply, readReply, sendJson, type JsonReply } from "@/shared/http/api-client";

/**
 * As rotas do agente, tipadas pelo contrato que elas mesmas anotam.
 *
 * Recusa vira `ApiError` (com a mensagem da rota); rede fora ou corpo que não é JSON sobem como o
 * erro do `fetch`. Quem decide o que dizer na tela em cada caso é o `useAgentSession`.
 */
export const agentApi = {
  ask: (input: {
    readonly prompt: string;
    readonly mode: AgentMode;
    readonly questionId: string | null;
    readonly context: readonly ContextItem[];
  }) => sendJson<AskAgentResponse>("/api/agents/ask", "POST", input),

  /**
   * Compila um candidato. Devolve o corpo **sem** olhar o status: a recusa (`{ error, message }`)
   * também vira prévia, com a mensagem como diagnóstico.
   */
  candidateRender: async (input: {
    readonly questionId: string;
    readonly field: LatexField;
    readonly value: string;
  }): Promise<JsonReply<CandidateRenderResponse>["body"]> => {
    const { body } = await readReply<CandidateRenderResponse>("/api/agents/candidate-render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return body;
  },

  applyPatch: (input: {
    readonly questionId: string;
    readonly approvedChangeIds: readonly string[];
    readonly patch: QuestionPatch;
  }) => sendJson<ApplyPatchResponse>("/api/agents/patches/apply", "POST", input),

  /**
   * Volta a questão a uma revisão. A resposta (`RevertPatchResponse`) não decide nada, nem a
   * recusa, nem um corpo que não é JSON: o histórico recarrega a tela de qualquer jeito, e só a
   * rede fora interrompe.
   */
  revertPatch: async (input: {
    readonly questionId: string;
    readonly revisionNumber: number;
  }): Promise<void> => {
    await readLenientReply<RevertPatchResponse>("/api/agents/patches/revert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  },
};

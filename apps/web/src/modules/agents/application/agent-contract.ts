import type { AgentRunState, ToolCallRecord } from "@modules/agents/domain/agent-run";
import type { Change } from "@modules/agents/domain/patch-diff";
import type { QuestionPatch } from "@modules/agents/domain/question-patch";
import type { RenderDiagnostic } from "@/shared/ports";

import type { ApplyResult } from "./apply-question-patch";

/**
 * O contrato HTTP das rotas do agente, do jeito que a tela o lê.
 *
 * Só tipos, sem nada de servidor: a rota anota a resposta com eles (`satisfies`) e o cliente
 * (`agents/ui/agent-client.ts`) importa os mesmos. Mudar um campo de um lado sem o outro deixa de
 * passar pelo `tsc` (ARQ-10 da revisão de 2026-09-23).
 */

/** Uma proposta do agente, com o diff contra o estado corrente da questão. */
export interface AgentProposalDto {
  readonly patch: QuestionPatch;
  readonly summary: string;
  readonly warnings: readonly string[];
  readonly changes: readonly Change[];
}

/** `POST /api/agents/ask`, 200. */
export interface AskAgentResponse {
  readonly answer: string;
  readonly proposals: readonly AgentProposalDto[];
  readonly state: AgentRunState;
  readonly toolCalls: readonly ToolCallRecord[];
  readonly usage: { readonly inputTokens: number | null; readonly outputTokens: number | null };
  readonly durationMs: number;
  readonly error: string | null;
  readonly runId: string | null;
}

/** `POST /api/agents/candidate-render`, 200. */
export interface CandidateRenderResponse {
  readonly success: boolean;
  readonly durationMs: number;
  readonly diagnostics: readonly RenderDiagnostic[];
  /** Data URI da primeira página, ou `null` quando a compilação não gerou imagem. */
  readonly png: string | null;
}

/** `POST /api/agents/patches/apply`, 200. */
export type ApplyPatchResponse = ApplyResult;

/** `POST /api/agents/patches/revert`, 200. */
export interface RevertPatchResponse {
  readonly revisionNumber: number;
  readonly revertedTo: number;
}

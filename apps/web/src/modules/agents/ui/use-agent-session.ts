"use client";

import { useCallback, useState } from "react";

import type { AgentProposalDto } from "@modules/agents/application/agent-contract";
import {
  attach,
  clearContext,
  ContextTooLargeError,
  detach,
  EMPTY_CONTEXT,
  type AgentContext,
  type ContextItem,
} from "@modules/agents/domain/agent-context";
import type { AgentMode } from "@modules/agents/domain/agent-run";
import { isLatexField } from "@modules/rendering/domain/render-source";
import { ApiError } from "@/shared/http/api-client";

import type { AgentTurn } from "./AgentPanel";
import { agentApi } from "./agent-client";
import type { CandidatePreview } from "./PatchReviewPanel";

/**
 * A sessão do agente: contexto, conversa, modo e a proposta pendente.
 *
 * Morava dentro do workbench da publicação, entre a árvore, os filtros e a lixeira (ARQ-08 da
 * revisão de 2026-09-23). Aqui ela não sabe de árvore nenhuma: recebe a questão em foco e avisa
 * quando um patch foi aplicado — quem monta a tela decide o que recarregar.
 */
export interface AgentSessionOptions {
  /** A questão em foco, ou `null` quando o nó corrente não é questão. */
  readonly questionId: string | null;
  /** Depois de aplicar: a tela recarrega o que mostra (no workbench, `router.refresh`). */
  readonly onApplied?: () => void;
}

export interface AgentSession {
  readonly context: AgentContext;
  /** Anexa recusando com mensagem em vez de estourar o teto em silêncio. */
  readonly attach: (item: ContextItem) => void;
  readonly detach: (id: string) => void;
  readonly clear: () => void;
  readonly error: string | null;
  readonly turns: readonly AgentTurn[];
  readonly busy: boolean;
  readonly mode: AgentMode;
  readonly setMode: (mode: AgentMode) => void;
  readonly proposal: AgentProposalDto | null;
  readonly rejectProposal: () => void;
  readonly ask: (prompt: string) => Promise<void>;
  /** A proposta sai da tela e o feedback vira a próxima pergunta. */
  readonly requestRevision: (feedback: string) => Promise<void>;
  readonly previewChange: (change: {
    readonly id: string;
    readonly before: string;
    readonly after: string;
  }) => Promise<{ before: CandidatePreview; after: CandidatePreview }>;
  readonly applyProposal: (approvedChangeIds: readonly string[]) => Promise<void>;
}

export function useAgentSession({ questionId, onApplied }: AgentSessionOptions): AgentSession {
  /**
   * O contexto do agente — montado por gesto, nunca por dedução.
   *
   * **Não** persiste entre sessões, ao contrário de quase tudo no workbench. Reabrir o app amanhã
   * com um trecho de outra questão pendurado no contexto, sem lembrar de tê-lo anexado, é
   * exatamente o tipo de surpresa que o contexto explícito existe para impedir.
   */
  const [context, setContext] = useState<AgentContext>(EMPTY_CONTEXT);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<readonly AgentTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<AgentMode>("ASK");

  /**
   * A proposta pendente — uma de cada vez.
   *
   * Revisar duas propostas concorrentes sobre a mesma questão é revisar um diff contra um estado
   * que a outra vai mudar. Quando o agente propõe mais de uma coisa no mesmo turno, a primeira é
   * a que vale, e as outras voltam se ele for perguntado de novo.
   */
  const [proposal, setProposal] = useState<AgentProposalDto | null>(null);

  const attachItem = useCallback((item: ContextItem) => {
    setContext((current) => {
      try {
        setError(null);
        return attach(current, item);
      } catch (problem) {
        setError(
          problem instanceof ContextTooLargeError ? problem.message : "Não deu para anexar.",
        );
        return current;
      }
    });
  }, []);

  const detachItem = useCallback((id: string) => setContext((current) => detach(current, id)), []);
  const clear = useCallback(() => setContext(clearContext()), []);
  const rejectProposal = useCallback(() => setProposal(null), []);

  /**
   * Manda a pergunta e o contexto para o servidor, que tem a chave e as tools.
   *
   * A pergunta do usuário entra na conversa **antes** da resposta chegar: uma requisição que
   * demora vinte segundos com a tela em branco parece travada, e a pergunta na tela é o que diz
   * que ela foi recebida.
   */
  const ask = useCallback(
    async (prompt: string) => {
      const mine = `u-${prompt.length}-${turns.length}`;
      setTurns((current) => [...current, { id: mine, role: "user", text: prompt }]);
      setBusy(true);
      setError(null);

      try {
        const payload = await agentApi.ask({ prompt, mode, questionId, context: context.items });

        // Só propostas que de fato mudam alguma coisa: um patch que reescreve o campo com o
        // mesmo texto viraria uma tela de revisão sem conteúdo.
        const first = payload.proposals?.find((entry) => entry.changes.length > 0);
        if (first) setProposal(first);

        setTurns((current) => [
          ...current,
          {
            id: `a-${mine}`,
            role: "assistant",
            text: payload.answer ?? payload.error ?? "(sem resposta)",
            ...(payload.toolCalls ? { toolCalls: payload.toolCalls } : {}),
            ...(payload.usage ? { usage: payload.usage } : {}),
          },
        ]);
      } catch (problem) {
        // A pergunta do usuário fica na tela. Perder o que ele escreveu por causa de um
        // endpoint fora do ar seria cobrar dele o preço da nossa configuração.
        setError(
          problem instanceof ApiError
            ? (problem.serverMessage ?? "O agente não respondeu.")
            : "Não deu para falar com o servidor.",
        );
      } finally {
        setBusy(false);
      }
    },
    [context, mode, questionId, turns.length],
  );

  const requestRevision = useCallback(
    async (feedback: string) => {
      // Revisar uma proposta que o agente já foi convidado a substituir é revisar o que vai ser
      // descartado.
      setProposal(null);
      await ask(feedback);
    },
    [ask],
  );

  /**
   * Compila o antes e o depois de uma linha de LaTeX, para a revisão.
   *
   * Duas compilações em paralelo: o worker aguenta, e serializá-las dobraria a espera de quem só
   * quer ver se a mudança quebrou a questão.
   */
  const previewChange = useCallback(
    async (change: { readonly id: string; readonly before: string; readonly after: string }) => {
      // O id é `field:<campo>:<impressão do antes>` — a impressão não é parte do nome do campo.
      const [kind, target] = change.id.split(":");
      const field = kind === "field" && isLatexField(target) ? target : null;
      if (!questionId || field === null) throw new Error("Esta linha não é um campo de texto.");

      const compile = async (value: string): Promise<CandidatePreview> => {
        const payload = await agentApi.candidateRender({ questionId, field, value });
        return {
          png: payload.png ?? null,
          success: payload.success ?? false,
          diagnostics: payload.diagnostics ?? [
            { severity: "error", message: payload.message ?? "" },
          ],
        };
      };

      const [before, after] = await Promise.all([compile(change.before), compile(change.after)]);
      return { before, after };
    },
    [questionId],
  );

  /** Aplica só o que foi marcado. O servidor recalcula o diff e recusa se nada sobrou. */
  const applyProposal = useCallback(
    async (approvedChangeIds: readonly string[]) => {
      if (!questionId || !proposal) return;

      setBusy(true);
      try {
        const payload = await agentApi.applyPatch({
          questionId,
          approvedChangeIds,
          patch: proposal.patch,
        });

        setProposal(null);
        setTurns((current) => [
          ...current,
          {
            id: `sys-${current.length}`,
            role: "assistant",
            text:
              `Aplicado. Revisão ${payload.revisionNumber} guarda o estado anterior.` +
              (payload.stale?.length
                ? ` ${payload.stale.length} mudança(s) já não existiam e foram ignoradas.`
                : ""),
          },
        ]);
        onApplied?.();
      } catch (problem) {
        setError(
          problem instanceof ApiError
            ? (problem.serverMessage ?? "Não deu para aplicar.")
            : "Não deu para falar com o servidor.",
        );
      } finally {
        setBusy(false);
      }
    },
    [onApplied, proposal, questionId],
  );

  return {
    context,
    attach: attachItem,
    detach: detachItem,
    clear,
    error,
    turns,
    busy,
    mode,
    setMode,
    proposal,
    rejectProposal,
    ask,
    requestRevision,
    previewChange,
    applyProposal,
  };
}

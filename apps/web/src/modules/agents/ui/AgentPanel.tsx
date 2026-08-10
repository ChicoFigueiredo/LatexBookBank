"use client";

import { useState } from "react";

import { Badge, Banner, Button, EmptyState, Icon, injectCss } from "@/design-system";
import type { AgentContext } from "@modules/agents/domain/agent-context";
import type { ToolCallRecord } from "@modules/agents/domain/agent-run";
import type { Change } from "@modules/agents/domain/patch-diff";

import { AIContextBar } from "./AIContextBar";
import { PatchReviewPanel } from "./PatchReviewPanel";
import { ToolCallCard } from "./ToolCallCard";

/**
 * O painel do agente — **somente leitura** nesta fase.
 *
 * O agente propõe; quem escreve é o usuário. Nenhuma tool de escrita existe aqui, e não é uma
 * limitação temporária a ser afrouxada depois: é a regra de que o agente nunca toca o banco sem
 * aprovação humana explícita, feita de arquitetura em vez de prompt. Um prompt pedindo para não
 * escrever é uma sugestão; uma tool que não existe é uma garantia.
 *
 * O painel é presentacional. Quem executa o turno é o runner, que ainda não existe — daí `onSend`
 * ser prop e não `fetch` aqui dentro.
 *
 * Ver spec §14.6 · issue #93.
 */

const CSS = `
.lbb-agent{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--surface)}
.lbb-agent-head{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--border-subtle)}
.lbb-agent-model{font-family:var(--font-mono);font-size:var(--text-micro);color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lbb-agent-log{flex:1;min-height:0;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:10px}
.lbb-agent-turn{display:grid;gap:4px}
.lbb-agent-who{font-family:var(--font-mono);font-size:var(--text-micro);letter-spacing:var(--tracking-wide);text-transform:uppercase;color:var(--text-secondary)}
.lbb-agent-tools{display:grid;gap:4px;margin:2px 0}
.lbb-agent-usage{font-family:var(--font-mono);font-size:var(--text-micro);color:var(--text-muted)}
.lbb-agent-said{font-size:var(--text-body-sm);color:var(--text-primary);white-space:pre-wrap;word-break:break-word}
.lbb-agent-compose{display:grid;gap:6px;padding:10px;border-top:1px solid var(--border-subtle)}
.lbb-agent-input{width:100%;min-height:64px;resize:vertical;padding:8px;border:1px solid var(--border-default);border-radius:var(--radius-md);background:var(--surface-raised);color:var(--text-primary);font-family:var(--font-ui);font-size:var(--text-body-sm)}
.lbb-agent-input:focus-visible{outline:2px solid var(--focus-ring);outline-offset:-1px}
.lbb-agent-send{display:flex;align-items:center;gap:8px}
.lbb-agent-hint{font-family:var(--font-mono);font-size:var(--text-micro);color:var(--text-secondary);margin-left:auto}
`;

export interface AgentTurn {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly text: string;
  /** O que o agente leu para responder. Vazio quando ele respondeu sem consultar nada. */
  readonly toolCalls?: readonly ToolCallRecord[];
  readonly usage?: { readonly inputTokens: number | null; readonly outputTokens: number | null };
}

export interface AgentPanelProps {
  readonly context: AgentContext;
  readonly onDetach: (id: string) => void;
  readonly onClear?: () => void;
  /** `null` quando não há IA configurada — o painel diz o que falta em vez de sumir. */
  readonly model: string | null;
  readonly providerLabel: string | null;
  readonly turns?: readonly AgentTurn[];
  readonly onSend?: (prompt: string) => void;
  readonly busy?: boolean;
  /** Recusa de anexo, falha de provider — o que o painel precisa dizer sem apagar a conversa. */
  readonly error?: string | null;
  /**
   * A proposta pendente, quando há uma.
   *
   * Uma de cada vez, de propósito: revisar duas propostas concorrentes sobre a mesma questão é
   * revisar um diff contra um estado que a outra vai mudar.
   */
  readonly proposal?: {
    readonly summary: string;
    readonly warnings: readonly string[];
    readonly changes: readonly Change[];
  } | null;
  readonly onApplyProposal?: (approvedChangeIds: readonly string[]) => void;
  readonly onRejectProposal?: () => void;
  readonly onRequestRevision?: (feedback: string) => void;
  /** Modo `REVIEW`: o agente ganha as tools de proposta. */
  readonly reviewMode?: boolean;
  readonly onReviewModeChange?: (enabled: boolean) => void;
}

export function AgentPanel({
  context,
  onDetach,
  onClear,
  model,
  providerLabel,
  turns = [],
  onSend,
  busy = false,
  error = null,
  proposal = null,
  onApplyProposal,
  onRejectProposal,
  onRequestRevision,
  reviewMode = false,
  onReviewModeChange,
}: AgentPanelProps) {
  injectCss("lbb-agent-css", CSS);

  const [draft, setDraft] = useState("");
  const configured = providerLabel !== null && model !== null;

  const send = () => {
    const prompt = draft.trim();
    if (prompt === "" || !onSend || busy) return;
    onSend(prompt);
    setDraft("");
  };

  return (
    <div className="lbb-agent">
      <div className="lbb-agent-head">
        {/* Provider e modelo à vista, sempre. Sem isso não dá para saber se a resposta veio do
            modelo local ou de um endpoint pago — e a diferença importa nas duas direções. */}
        {/* O tom `ai` do DS existe justamente para isto: o que vem de modelo tem cor própria e
            não se confunde com o que o usuário escreveu. */}
        <Badge tone={configured ? "ai" : "neutral"}>{providerLabel ?? "sem IA"}</Badge>
        <span className="lbb-agent-model" title={model ?? undefined}>
          {model ?? "configure AI_BASE_URL em .env.local"}
        </span>
        {onReviewModeChange ? (
          // O modo é do usuário, e o default é `ASK`: ganhar tools de proposta precisa ser
          // pedido. Mesmo em `REVIEW` nada é escrito — o agente propõe, e a aplicação é outra
          // rota, com aprovação por linha.
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={reviewMode}
            disabled={!configured || busy}
            onClick={() => onReviewModeChange(!reviewMode)}
            title="Deixa o agente propor mudanças, que você revisa antes de aplicar"
          >
            {reviewMode ? "Modo revisão" : "Modo pergunta"}
          </Button>
        ) : (
          <Badge tone="neutral" title="Nenhuma tool de escrita existe nesta fase">
            somente leitura
          </Badge>
        )}
      </div>

      <AIContextBar context={context} onDetach={onDetach} {...(onClear ? { onClear } : {})} />

      {error !== null && (
        <div style={{ padding: "var(--space-3) var(--space-3) 0" }}>
          {/* Sem `onDismiss`: a recusa some sozinha quando o próximo anexo dá certo, e um botão
              de fechar sugeriria que ela é opcional de ler. */}
          <Banner tone="warn" title="Contexto">
            {error}
          </Banner>
        </div>
      )}

      {proposal !== null && onApplyProposal && onRejectProposal && onRequestRevision && (
        <div style={{ padding: "var(--space-3)", borderBottom: "1px solid var(--border-subtle)" }}>
          <PatchReviewPanel
            summary={proposal.summary}
            warnings={proposal.warnings}
            changes={proposal.changes}
            onApply={onApplyProposal}
            onReject={onRejectProposal}
            onRequestRevision={onRequestRevision}
            busy={busy}
          />
        </div>
      )}

      <div className="lbb-agent-log" aria-label="Conversa" aria-live="polite">
        {turns.length === 0 ? (
          <EmptyState
            icon="sparkles"
            title="O agente ainda não foi acionado"
            description="Anexe o que ele deve ver e pergunte. Ele propõe mudanças — quem aplica é você."
          />
        ) : (
          turns.map((turn) => (
            <div key={turn.id} className="lbb-agent-turn">
              <span className="lbb-agent-who">{turn.role === "user" ? "Você" : "Agente"}</span>

              {/* A timeline vem **antes** do texto: é a procedência da resposta, e lê-la depois
                  já é ter acreditado. */}
              {turn.toolCalls && turn.toolCalls.length > 0 && (
                <div className="lbb-agent-tools">
                  {turn.toolCalls.map((call, index) => (
                    <ToolCallCard key={`${call.name}-${index}`} call={call} />
                  ))}
                </div>
              )}

              <span className="lbb-agent-said">{turn.text}</span>

              {turn.usage &&
                (turn.usage.inputTokens !== null || turn.usage.outputTokens !== null) && (
                  // Custo à vista quando o provider informa. O Ollama não informa dinheiro, mas
                  // informa tokens — e é o que permite perceber que o contexto está caro.
                  <span className="lbb-agent-usage">
                    {turn.usage.inputTokens ?? "?"} entrada · {turn.usage.outputTokens ?? "?"} saída
                  </span>
                )}
            </div>
          ))
        )}
      </div>

      <div className="lbb-agent-compose">
        <textarea
          className="lbb-agent-input"
          aria-label="Pergunta ao agente"
          placeholder={configured ? "O que você quer saber?" : "Configure um endpoint de IA…"}
          value={draft}
          disabled={!configured || busy}
          onChange={(event) => setDraft(event.target.value)}
          // `Ctrl+Enter` e não `Enter`: a pergunta costuma ter mais de uma linha, e enviar na
          // primeira quebra seria enviar meia pergunta. É o mesmo gesto do render (Fase 6).
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              send();
            }
          }}
        />
        <div className="lbb-agent-send">
          <Button
            size="sm"
            variant="primary"
            disabled={!configured || busy || draft.trim() === ""}
            loading={busy}
            onClick={send}
          >
            Perguntar ao agente
          </Button>
          <span className="lbb-agent-hint">
            <Icon name="command" size={11} /> Ctrl+Enter
          </span>
        </div>
      </div>
    </div>
  );
}

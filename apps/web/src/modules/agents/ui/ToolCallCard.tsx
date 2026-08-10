"use client";

import { Icon, injectCss } from "@/design-system";
import type { ToolCallRecord } from "@modules/agents/domain/agent-run";

/**
 * O que o agente leu, à vista.
 *
 * Sem isto, uma resposta do modelo é uma afirmação sem procedência: o usuário não tem como saber
 * se ela veio da questão aberta, de uma busca que trouxe outra coisa, ou de nada. O card mostra a
 * ferramenta, o que foi pedido, quanto voltou e quanto demorou — o bastante para desconfiar na
 * hora certa.
 *
 * Ver spec §14.6 · issue #97.
 */

const CSS = `
.lbb-tcc{display:flex;align-items:center;gap:8px;padding:5px 8px;border:1px solid var(--border-subtle);border-radius:var(--radius-sm);background:var(--surface-sunken);font-family:var(--font-mono);font-size:var(--text-micro);color:var(--text-secondary)}
.lbb-tcc[data-status="error"]{border-color:var(--danger-border);background:var(--danger-surface);color:var(--danger-text)}
.lbb-tcc-name{font-weight:var(--weight-medium);color:var(--text-primary);white-space:nowrap}
.lbb-tcc[data-status="error"] .lbb-tcc-name{color:inherit}
.lbb-tcc-input{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lbb-tcc-meta{white-space:nowrap;opacity:.8}
`;

export interface ToolCallCardProps {
  readonly call: ToolCallRecord;
}

export function ToolCallCard({ call }: ToolCallCardProps) {
  injectCss("lbb-tcc-css", CSS);

  return (
    <div
      className="lbb-tcc"
      data-status={call.status}
      // O status vai no rótulo e não só na cor: leitor de tela não enxerga a borda vermelha, e
      // "chamou uma tool" e "a tool falhou" são coisas diferentes.
      aria-label={`Ferramenta ${call.name}, ${call.status === "ok" ? "concluída" : "com erro"}`}
    >
      <Icon name={call.status === "ok" ? "circle-check" : "circle-alert"} size={12} />
      <span className="lbb-tcc-name">{call.name}</span>
      <span className="lbb-tcc-input">{call.error ?? call.inputSummary}</span>
      <span className="lbb-tcc-meta">
        {call.outputChars.toLocaleString("pt-BR")} car · {call.durationMs} ms
      </span>
    </div>
  );
}

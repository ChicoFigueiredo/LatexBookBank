"use client";

import { Button, Chip, injectCss } from "@/design-system";
import {
  CONTEXT_KIND_LABELS,
  MAX_CONTEXT_CHARS,
  contextSize,
  type AgentContext,
} from "@modules/agents/domain/agent-context";

/**
 * A barra que mostra **tudo** que o agente vai ver.
 *
 * É a peça que torna o painel auditável. Cada item é um chip com botão de remover, e o tamanho
 * total fica à vista — porque o custo de uma pergunta é o contexto, não a pergunta, e quem não vê
 * o contexto descobre isso na fatura.
 *
 * Ver spec §14.6 · issue #93.
 */

const CSS = `
.lbb-ctxbar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--border-subtle);background:var(--surface-sunken)}
.lbb-ctxbar-empty{color:var(--text-secondary);font-size:var(--text-body-sm)}
.lbb-ctxbar-size{margin-left:auto;font-family:var(--font-mono);font-size:var(--text-micro);color:var(--text-secondary);white-space:nowrap}
.lbb-ctxbar-size[data-full="true"]{color:var(--danger-text)}
.lbb-ctxbar-implicit{opacity:.8;border-style:dashed}
`;

export interface AIContextBarProps {
  readonly context: AgentContext;
  readonly onDetach: (id: string) => void;
  readonly onClear?: () => void;
}

export function AIContextBar({ context, onDetach, onClear }: AIContextBarProps) {
  injectCss("lbb-ctxbar-css", CSS);

  const size = contextSize(context);
  const share = Math.round((size / MAX_CONTEXT_CHARS) * 100);

  return (
    <div className="lbb-ctxbar" aria-label="Contexto do agente" role="group">
      {context.items.length === 0 ? (
        <span className="lbb-ctxbar-empty">
          {/* Vazio é um estado legítimo, não um erro: dá para perguntar sobre LaTeX sem anexar
              nada. O texto diz o que fazer em vez de acusar falta. */}
          Nenhum contexto anexado — o agente só vê o que você anexar aqui.
        </span>
      ) : (
        context.items.map((item) => (
          <Chip
            key={item.id}
            // O tracejado marca o que o painel anexou sozinho ao abrir. Continua removível — a
            // diferença é só que não foi um gesto do usuário, e ele precisa poder notar.
            className={item.explicit ? "lbb-chip" : "lbb-chip lbb-ctxbar-implicit"}
            onRemove={() => onDetach(item.id)}
            removeLabel={`Remover ${item.label} do contexto`}
            title={`${CONTEXT_KIND_LABELS[item.kind]} · ${item.content.length.toLocaleString("pt-BR")} caracteres`}
          >
            {item.label}
          </Chip>
        ))
      )}

      {context.items.length > 0 && (
        <>
          <span className="lbb-ctxbar-size" data-full={share >= 90 ? "true" : "false"}>
            {share}% de {(MAX_CONTEXT_CHARS / 1000).toFixed(0)}k
          </span>
          {onClear && (
            <Button size="sm" variant="ghost" onClick={onClear}>
              Limpar
            </Button>
          )}
        </>
      )}
    </div>
  );
}

"use client";

import { useCallback, useState } from "react";

import { Button, EmptyState, Icon, injectCss, type IconName } from "@/design-system";
import type { Check, CheckState } from "@modules/questions/domain/validation-checklist";

/**
 * A lista de verificação da questão (design §25).
 *
 * O que existia antes era o selo `INVALID` na árvore — vermelho, gravado em silêncio a cada
 * salvamento, e **mudo sobre o motivo**. Aqui a mesma validação vira frase: o que está pronto, o
 * que impede, e o que só merece um olhar.
 *
 * Nada roda sozinho ao abrir a aba: validar é gesto, e uma tela que se autoavalia a cada visita
 * transformaria "conferir" em ruído de fundo. O botão é a ação, e o resultado fica.
 */

const CSS = `
.lbb-val{display:flex;flex-direction:column;height:100%;min-height:0}
.lbb-val-head{display:flex;align-items:center;gap:8px;padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--border-subtle)}
.lbb-val-list{flex:1;min-height:0;overflow-y:auto;padding:var(--space-3) var(--space-4);display:flex;flex-direction:column;gap:2px}
.lbb-val-item{display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border-radius:var(--radius-sm);font-size:var(--text-body)}
.lbb-val-item[data-state="error"]{background:var(--danger-surface);color:var(--danger-text)}
.lbb-val-item[data-state="warning"]{color:var(--warn-text)}
.lbb-val-item[data-state="ok"]{color:var(--text-secondary)}
.lbb-val-item[data-state="pending"]{color:var(--text-muted)}
.lbb-val-icon{flex-shrink:0;margin-top:1px}
.lbb-val-detail{font-family:var(--font-mono);font-size:var(--text-meta);color:var(--text-muted);margin-top:2px}
`;

const ICONS: Readonly<Record<CheckState, IconName>> = {
  ok: "circle-check",
  error: "circle-x",
  warning: "triangle-alert",
  pending: "clock",
};

export interface ValidationPaneProps {
  readonly publicationId: string;
  readonly questionId: string;
  readonly disabled?: boolean;
}

export function ValidationPane({ publicationId, questionId, disabled = false }: ValidationPaneProps) {
  injectCss("lbb-val-css", CSS);

  const [checks, setChecks] = useState<readonly Check[] | null>(null);
  const [usable, setUsable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = useCallback(async () => {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/publications/${publicationId}/questions/${questionId}/validation`,
        { method: "POST" },
      );
      const payload = (await response.json()) as {
        checks?: Check[];
        usable?: boolean;
        message?: string;
      };

      if (!response.ok) {
        setError(payload.message ?? "Não deu para validar.");
        return;
      }

      setChecks(payload.checks ?? []);
      setUsable(payload.usable ?? null);
    } catch {
      setError("Não deu para falar com o servidor.");
    } finally {
      setBusy(false);
    }
  }, [publicationId, questionId]);

  return (
    <div className="lbb-val">
      <div className="lbb-val-head">
        <Button
          size="sm"
          variant="primary"
          icon="circle-check"
          loading={busy}
          disabled={disabled}
          onClick={() => void validate()}
        >
          Validar questão
        </Button>

        {usable !== null && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-meta)",
              color: usable ? "var(--ok-text)" : "var(--danger-text)",
            }}
          >
            {usable ? "pronta para usar" : "há o que corrigir"}
          </span>
        )}
      </div>

      <div className="lbb-val-list">
        {error && <div style={{ color: "var(--danger-text)" }}>{error}</div>}

        {checks === null && !error && (
          <EmptyState
            icon="circle-check"
            title="Questão ainda não conferida nesta sessão"
            // O selo da árvore vem da última gravação; esta lista vem de agora. Dizer isso evita
            // a pergunta "então por que está vermelha lá e vazia aqui?".
            description="Validar confere enunciado, alternativas, gabarito, LaTeX e o último render — e atualiza o selo da árvore."
          />
        )}

        {checks?.map((check) => (
          <div key={check.id} className="lbb-val-item" data-state={check.state}>
            <span className="lbb-val-icon">
              <Icon name={ICONS[check.state]} />
            </span>
            <span>
              {check.label}
              {check.detail && <div className="lbb-val-detail">{check.detail}</div>}
            </span>
          </div>
        ))}

        {checks?.length === 0 && (
          <div style={{ color: "var(--text-muted)" }}>Nada a verificar para este tipo.</div>
        )}
      </div>
    </div>
  );
}

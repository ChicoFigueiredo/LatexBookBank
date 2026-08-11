"use client";

import { useMemo, useState } from "react";

import { Badge, Banner, Button, Checkbox, injectCss } from "@/design-system";
import type { Change } from "@modules/agents/domain/patch-diff";
import { LatexDiff } from "@modules/latex/ui/LatexDiff";

/**
 * A tela onde o humano decide.
 *
 * **O default é nada aprovado.** Um formulário que chega com tudo marcado transforma revisão em
 * confirmação, e a aprovação explícita que o servidor exige viraria uma formalidade — o usuário
 * clicaria "aplicar" sem ter olhado linha nenhuma, e o sistema registraria isso como aprovação.
 *
 * "Aplicar tudo" existe porque revisar cinco linhas e marcar as cinco é trabalho repetido, não
 * porque aprovar sem ler seja aceitável. A diferença é que o gesto continua sendo do usuário.
 *
 * Ver spec §35 · issue #103.
 */

const CSS = `
.lbb-review{display:flex;flex-direction:column;gap:var(--space-3);min-height:0}
.lbb-review-head{display:grid;gap:6px}
.lbb-review-summary{font-size:var(--text-body-sm);color:var(--text-primary)}
.lbb-review-fields{display:flex;flex-wrap:wrap;gap:6px;font-family:var(--font-mono);font-size:var(--text-micro);color:var(--text-secondary)}
.lbb-review-list{display:grid;gap:var(--space-3);min-height:0;overflow-y:auto}
.lbb-review-row{border:1px solid var(--border-default);border-radius:var(--radius-md);background:var(--surface)}
.lbb-review-row[data-approved="true"]{border-color:var(--accent-border);background:var(--accent-surface)}
.lbb-review-row-head{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--border-subtle)}
.lbb-review-row-label{font-weight:var(--weight-medium);font-size:var(--text-body-sm)}
.lbb-review-plain{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border-subtle)}
.lbb-review-side{padding:8px 10px;background:var(--surface);font-size:var(--text-body-sm);word-break:break-word}
.lbb-review-side-label{display:block;font-family:var(--font-mono);font-size:var(--text-micro);letter-spacing:var(--tracking-wide);text-transform:uppercase;color:var(--text-muted);margin-bottom:2px}
.lbb-review-side[data-side="after"]{background:var(--ok-surface);color:var(--ok-text)}
.lbb-review-preview{padding:6px 10px;border-bottom:1px solid var(--border-subtle)}
.lbb-review-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding-top:var(--space-2);border-top:1px solid var(--border-subtle)}
.lbb-review-count{font-family:var(--font-mono);font-size:var(--text-micro);color:var(--text-secondary);margin-right:auto}
`;

export interface CandidatePreview {
  readonly png: string | null;
  readonly success: boolean;
  readonly diagnostics: readonly { readonly severity: string; readonly message: string }[];
}

export interface PatchReviewPanelProps {
  readonly summary: string;
  readonly warnings: readonly string[];
  readonly changes: readonly Change[];
  readonly onApply: (approvedChangeIds: readonly string[]) => void;
  readonly onReject: () => void;
  /** O feedback volta ao agente como próxima pergunta. */
  readonly onRequestRevision: (feedback: string) => void;
  readonly busy?: boolean;
  readonly theme?: "light" | "dark";
  /**
   * Compila o antes e o depois de uma linha de LaTeX.
   *
   * Ausente quando o worker não está configurado — o app funciona sem render, e um botão que não
   * faz nada é pior que botão nenhum.
   */
  readonly onPreview?: (change: Change) => Promise<{
    before: CandidatePreview;
    after: CandidatePreview;
  }>;
}

export function PatchReviewPanel({
  summary,
  warnings,
  changes,
  onApply,
  onReject,
  onRequestRevision,
  busy = false,
  theme = "light",
  onPreview,
}: PatchReviewPanelProps) {
  injectCss("lbb-review-css", CSS);

  // Começa **vazio**. É a decisão inteira desta tela.
  const [approved, setApproved] = useState<ReadonlySet<string>>(new Set());
  const [feedback, setFeedback] = useState("");
  const [askingRevision, setAskingRevision] = useState(false);
  const [previews, setPreviews] = useState<
    Readonly<Record<string, { before: CandidatePreview; after: CandidatePreview } | "loading">>
  >({});

  const allIds = useMemo(() => changes.map((change) => change.id), [changes]);

  const toggle = (id: string) => {
    setApproved((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (changes.length === 0) {
    return (
      <Banner tone="info" title="Nada a revisar">
        {/* Acontece quando o agente propõe o que já está lá. Dizer isso é melhor que uma lista
            vazia, que pareceria erro de carregamento. */}
        A proposta não muda nada em relação ao estado atual da questão.
      </Banner>
    );
  }

  return (
    <div className="lbb-review">
      <div className="lbb-review-head">
        <Badge tone="ai">Proposta do agente</Badge>
        {/* O que ele **entendeu** — um diff correto por acidente e um correto de propósito são a
            mesma imagem, e a diferença aparece aqui. */}
        <span className="lbb-review-summary">{summary}</span>
        <div className="lbb-review-fields">
          {changes.map((change) => (
            <span key={`chip-${change.id}`}>{change.label}</span>
          ))}
        </div>
      </div>

      {warnings.map((warning) => (
        <Banner key={warning} tone="warn" title="O agente avisou">
          {warning}
        </Banner>
      ))}

      <div className="lbb-review-list">
        {changes.map((change) => {
          const isApproved = approved.has(change.id);

          return (
            <div key={change.id} className="lbb-review-row" data-approved={String(isApproved)}>
              <div className="lbb-review-row-head">
                <Checkbox
                  checked={isApproved}
                  disabled={busy}
                  // O rótulo nomeia **qual** linha: numa lista de cinco, "aprovar" sozinho não
                  // diz nada a quem navega por teclado ou leitor de tela.
                  aria-label={`Aprovar: ${change.label}`}
                  onChange={() => toggle(change.id)}
                />
                <span className="lbb-review-row-label">{change.label}</span>
              </div>

              {change.latex && onPreview && (
                <div className="lbb-review-preview">
                  {previews[change.id] === undefined ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setPreviews((current) => ({ ...current, [change.id]: "loading" }));
                        void onPreview(change).then((result) =>
                          setPreviews((current) => ({ ...current, [change.id]: result })),
                        );
                      }}
                    >
                      Compilar antes e depois
                    </Button>
                  ) : previews[change.id] === "loading" ? (
                    <span className="lbb-review-side-label">compilando…</span>
                  ) : (
                    <div className="lbb-review-plain">
                      {(["before", "after"] as const).map((side) => {
                        const entry = previews[change.id] as {
                          before: CandidatePreview;
                          after: CandidatePreview;
                        };
                        const preview = entry[side];

                        return (
                          <div key={side} className="lbb-review-side" data-side={side}>
                            <span className="lbb-review-side-label">
                              {side === "before" ? "antes" : "depois"}
                            </span>
                            {preview.png ? (
                              // `img` e não `next/image`: a prévia é um data URI de bytes que
                              // nunca chegaram ao disco, e o otimizador do Next trabalha sobre
                              // URLs que ele possa buscar. Não há o que otimizar aqui.
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={preview.png}
                                alt={`Render ${side === "before" ? "antes" : "depois"} de ${change.label}`}
                                style={{ maxWidth: "100%", background: "var(--surface-paper)" }}
                              />
                            ) : (
                              <span>
                                {/* Não compilar é informação, não ausência de informação — e no
                                    lado "depois" é justamente o que impede aprovar. */}
                                Não compilou.{" "}
                                {preview.diagnostics[0]?.message ?? "Sem diagnóstico."}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {change.latex ? (
                <LatexDiff
                  before={change.before}
                  after={change.after}
                  theme={theme}
                  ariaLabel={`Diferenças em ${change.label}`}
                />
              ) : (
                <div className="lbb-review-plain">
                  <div className="lbb-review-side" data-side="before">
                    <span className="lbb-review-side-label">antes</span>
                    {change.before}
                  </div>
                  <div className="lbb-review-side" data-side="after">
                    <span className="lbb-review-side-label">depois</span>
                    {change.after}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {askingRevision ? (
        <div style={{ display: "grid", gap: 6 }}>
          <textarea
            className="lbb-agent-input"
            aria-label="O que revisar"
            placeholder="O que está errado na proposta?"
            value={feedback}
            disabled={busy}
            onChange={(event) => setFeedback(event.target.value)}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              size="sm"
              variant="primary"
              disabled={busy || feedback.trim() === ""}
              onClick={() => {
                onRequestRevision(feedback.trim());
                setFeedback("");
                setAskingRevision(false);
              }}
            >
              Mandar para o agente
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAskingRevision(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="lbb-review-actions">
          <span className="lbb-review-count">
            {approved.size} de {changes.length} aprovada{changes.length === 1 ? "" : "s"}
          </span>

          <Button
            size="sm"
            variant="primary"
            // Desabilitado com zero aprovadas: o servidor recusaria de qualquer forma, e um botão
            // que erra é pior que um botão que espera.
            disabled={busy || approved.size === 0}
            onClick={() => onApply([...approved])}
          >
            Aplicar seleção
          </Button>

          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            // Marca todas em vez de aplicar direto: o gesto continua sendo aprovar, e o usuário
            // ainda vê o que aprovou antes de confirmar.
            onClick={() => setApproved(new Set(allIds))}
          >
            Marcar todas
          </Button>

          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setAskingRevision(true)}>
            Pedir revisão
          </Button>

          <Button size="sm" variant="danger" disabled={busy} onClick={onReject}>
            Rejeitar
          </Button>
        </div>
      )}
    </div>
  );
}

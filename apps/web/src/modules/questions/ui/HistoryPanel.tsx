"use client";

import { useMemo, useState } from "react";

import { Badge, Banner, Button, EmptyState, injectCss } from "@/design-system";
import type { RevisionChange } from "@modules/questions/domain/revision-diff";

/**
 * A aba Histórico: o que aconteceu com a questão, e como voltar.
 *
 * A timeline mostra **origem** em cada linha, e não só data e resumo. É a informação que decide
 * como ler o resto: "o agente mudou o gabarito às 3h" e "eu mudei o gabarito às 3h" pedem reações
 * opostas, e sem a origem as duas linhas são idênticas.
 *
 * Restaurar pede confirmação. Não porque seja destrutivo — a restauração grava a sua própria
 * revisão antes, então nada se perde —, mas porque a lista é navegável com o teclado e um Enter
 * distraído sobre a linha errada troca o conteúdo da questão sem nenhum aviso.
 *
 * Ver spec §37 · issue #109.
 */

const CSS = `
.lbb-hist{display:flex;flex-direction:column;gap:var(--space-3);min-height:0;padding:var(--space-4)}
.lbb-hist-list{display:grid;gap:4px;min-height:0;overflow-y:auto}
.lbb-hist-row{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;border:1px solid var(--border-default);border-radius:var(--radius-md);background:var(--surface);font:inherit;font-size:var(--text-body-sm);text-align:left;cursor:pointer}
.lbb-hist-row:hover{border-color:var(--border-strong);background:var(--surface-raised)}
.lbb-hist-row[data-selected="true"]{border-color:var(--accent-border);background:var(--accent-surface)}
.lbb-hist-row:focus-visible{outline:2px solid var(--focus-ring);outline-offset:1px}
.lbb-hist-num{font-family:var(--font-mono);font-size:var(--text-micro);color:var(--text-muted);min-width:2.5rem}
.lbb-hist-summary{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lbb-hist-when{font-family:var(--font-mono);font-size:var(--text-micro);color:var(--text-muted);white-space:nowrap}
.lbb-hist-diff{display:grid;gap:6px}
.lbb-hist-change{border:1px solid var(--border-subtle);border-radius:var(--radius-sm);overflow:hidden}
.lbb-hist-change-label{padding:4px 8px;background:var(--surface-sunken);font-family:var(--font-mono);font-size:var(--text-micro);color:var(--text-secondary)}
.lbb-hist-sides{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border-subtle)}
.lbb-hist-side{padding:6px 8px;background:var(--surface);font-size:var(--text-body-sm);word-break:break-word;white-space:pre-wrap}
.lbb-hist-side[data-side="after"]{background:var(--ok-surface);color:var(--ok-text)}
`;

export interface RevisionRow {
  readonly revisionNumber: number;
  readonly origin: string;
  readonly summary: string;
  readonly createdAt: string;
}

export interface HistoryPanelProps {
  readonly revisions: readonly RevisionRow[];
  /** O diff da revisão selecionada contra o estado atual. `null` enquanto carrega. */
  readonly changes: readonly RevisionChange[] | null;
  readonly selected: number | null;
  readonly onSelect: (revisionNumber: number) => void;
  readonly onRestore: (revisionNumber: number) => void;
  readonly busy?: boolean;
}

const ORIGIN_TONES: Readonly<Record<string, "ai" | "accent" | "neutral" | "info">> = {
  AGENT: "ai",
  USER: "accent",
  IMPORT: "info",
  SYSTEM: "neutral",
};

const ORIGIN_LABELS: Readonly<Record<string, string>> = {
  AGENT: "agente",
  USER: "você",
  IMPORT: "import",
  SYSTEM: "sistema",
};

export function HistoryPanel({
  revisions,
  changes,
  selected,
  onSelect,
  onRestore,
  busy = false,
}: HistoryPanelProps) {
  injectCss("lbb-hist-css", CSS);

  const [confirming, setConfirming] = useState<number | null>(null);

  const chosen = useMemo(
    () => revisions.find((entry) => entry.revisionNumber === selected) ?? null,
    [revisions, selected],
  );

  if (revisions.length === 0) {
    return (
      <div className="lbb-hist">
        <EmptyState
          icon="history"
          title="Sem histórico ainda"
          description="Cada mudança aplicada guarda o estado anterior aqui. A primeira aparece depois da primeira edição."
        />
      </div>
    );
  }

  return (
    <div className="lbb-hist">
      <div className="lbb-hist-list" role="list" aria-label="Revisões">
        {revisions.map((revision) => (
          <button
            key={revision.revisionNumber}
            type="button"
            role="listitem"
            className="lbb-hist-row"
            data-selected={String(revision.revisionNumber === selected)}
            // O nome anuncia número, origem e resumo: numa lista de trinta, "revisão" sozinho não
            // permite escolher.
            aria-label={`Revisão ${revision.revisionNumber}, por ${ORIGIN_LABELS[revision.origin] ?? revision.origin}: ${revision.summary}`}
            onClick={() => onSelect(revision.revisionNumber)}
          >
            <span className="lbb-hist-num">#{revision.revisionNumber}</span>
            {/* A origem decide como ler o resto: "o agente mudou o gabarito" e "eu mudei o
                gabarito" pedem reações opostas. */}
            <Badge tone={ORIGIN_TONES[revision.origin] ?? "neutral"}>
              {ORIGIN_LABELS[revision.origin] ?? revision.origin}
            </Badge>
            <span className="lbb-hist-summary">{revision.summary || "(sem resumo)"}</span>
            <span className="lbb-hist-when">
              {new Date(revision.createdAt).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </button>
        ))}
      </div>

      {chosen !== null && (
        <>
          <Banner tone="info" title={`Revisão ${chosen.revisionNumber}`}>
            {/* O sentido do diff dito por extenso: sem isso, qual coluna é o passado depende de
                quem está olhando. */}
            À esquerda, como estava nesta revisão. À direita, como está agora.
          </Banner>

          {changes === null ? (
            <span className="lbb-hist-when">carregando…</span>
          ) : changes.length === 0 ? (
            <Banner tone="ok" title="Idêntica ao estado atual">
              Restaurar esta revisão não mudaria nada.
            </Banner>
          ) : (
            <div className="lbb-hist-diff">
              {changes.map((change) => (
                <div key={change.id} className="lbb-hist-change">
                  <div className="lbb-hist-change-label">{change.label}</div>
                  <div className="lbb-hist-sides">
                    <div className="lbb-hist-side" data-side="before">
                      {change.before}
                    </div>
                    <div className="lbb-hist-side" data-side="after">
                      {change.after}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {confirming === chosen.revisionNumber ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="lbb-hist-when">
                Voltar ao estado da revisão {chosen.revisionNumber}?
              </span>
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                onClick={() => {
                  onRestore(chosen.revisionNumber);
                  setConfirming(null);
                }}
              >
                Restaurar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || changes?.length === 0}
              onClick={() => setConfirming(chosen.revisionNumber)}
            >
              Restaurar esta revisão
            </Button>
          )}
        </>
      )}
    </div>
  );
}

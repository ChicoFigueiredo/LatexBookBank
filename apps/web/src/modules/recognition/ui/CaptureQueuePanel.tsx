"use client";

import { Badge, Button, EmptyState, injectCss } from "@/design-system";
import { QUEUE_LABELS, type QueueState } from "@modules/recognition/domain/capture-queue";

/**
 * A fila de captura na tela (design §15).
 *
 * Cada item mostra o que a §15 pede: miniatura, página, tipo do trabalho pendente e estado. E
 * **a fila continua acessível enquanto se revisa um item** — por isso ela é uma coluna ao lado, e
 * não uma tela separada.
 *
 * A miniatura vem da rota de conteúdo do asset, não de um blob em memória: a fila sobrevive ao
 * recarregamento, e um `objectURL` da sessão anterior não sobreviveria (§80 — asset por id, não
 * blob no estado).
 */

const CSS = `
.lbb-queue{display:flex;flex-direction:column;gap:6px;min-width:0}
.lbb-queue-head{display:flex;align-items:center;gap:8px;padding-bottom:4px}
.lbb-queue-title{font-family:var(--font-mono);font-size:var(--text-micro);font-weight:var(--weight-medium);letter-spacing:var(--tracking-wide);text-transform:uppercase;color:var(--text-muted)}
.lbb-queue-item{display:flex;align-items:center;gap:8px;padding:6px;border:1px solid var(--border-default);border-radius:var(--radius-md);background:var(--surface)}
.lbb-queue-item[data-state="error"]{border-color:var(--danger-border);background:var(--danger-surface)}
.lbb-queue-item[data-current="true"]{border-color:var(--accent);background:var(--accent-surface)}
.lbb-queue-thumb{width:56px;height:40px;flex-shrink:0;object-fit:cover;border-radius:var(--radius-sm);background:var(--surface-paper);border:1px solid var(--border-subtle)}
.lbb-queue-body{flex:1;min-width:0}
.lbb-queue-text{font-size:var(--text-body-sm);color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lbb-queue-meta{font-family:var(--font-mono);font-size:var(--text-micro);color:var(--text-muted)}
`;

const TONE: Readonly<Record<QueueState, "neutral" | "warn" | "danger" | "info">> = {
  queued: "neutral",
  review: "warn",
  error: "danger",
  approved: "info",
};

export interface QueueItem {
  readonly anchorId: string;
  readonly cropAssetId: string | null;
  readonly pageNumber: number;
  readonly createdAt: string;
  readonly recognizedText: string | null;
  readonly model: string | null;
  readonly state: QueueState;
}

export interface CaptureQueuePanelProps {
  readonly items: readonly QueueItem[];
  readonly currentAnchorId?: string | null;
  readonly onReview: (item: QueueItem) => void;
  readonly onDiscard: (item: QueueItem) => void;
  readonly busy?: boolean;
}

export function CaptureQueuePanel({
  items,
  currentAnchorId = null,
  onReview,
  onDiscard,
  busy = false,
}: CaptureQueuePanelProps) {
  injectCss("lbb-queue-css", CSS);

  return (
    <section className="lbb-queue" aria-label="Fila de captura">
      <div className="lbb-queue-head">
        <span className="lbb-queue-title">Fila de captura</span>
        {items.length > 0 && (
          <Badge tone="neutral" mono>
            {items.length}
          </Badge>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="Nada pendente"
          // O que a fila guarda são recortes **ainda não aprovados**. Dizer isso evita a leitura
          // de que ela é o histórico de tudo que já foi capturado.
          description="Os recortes salvos que ainda não viraram questão aparecem aqui — inclusive depois de fechar e reabrir."
        />
      ) : (
        items.map((item) => (
          <div
            key={item.anchorId}
            className="lbb-queue-item"
            data-state={item.state}
            data-current={item.anchorId === currentAnchorId ? "true" : "false"}
          >
            {item.cropAssetId !== null && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="lbb-queue-thumb"
                src={`/api/assets/${item.cropAssetId}/content`}
                alt={`Recorte da página ${item.pageNumber}`}
                loading="lazy"
              />
            )}

            <div className="lbb-queue-body">
              <div className="lbb-queue-text" title={item.recognizedText ?? undefined}>
                {item.recognizedText?.trim() || "sem transcrição ainda"}
              </div>
              <div className="lbb-queue-meta">
                página {item.pageNumber}
                {item.model ? ` · ${item.model}` : ""}
              </div>
            </div>

            <Badge tone={TONE[item.state]} mono>
              {QUEUE_LABELS[item.state]}
            </Badge>

            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onReview(item)}>
              Revisar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon="circle-x"
              disabled={busy}
              aria-label={`Descartar recorte da página ${item.pageNumber}`}
              onClick={() => onDiscard(item)}
            />
          </div>
        ))
      )}
    </section>
  );
}

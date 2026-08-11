import type { HTMLAttributes, ReactNode } from "react";

import { injectCss } from "../shared/inject-css";

const CSS = `
.lbb-metric{display:flex;flex-direction:column;gap:2px;padding:var(--space-3) var(--space-4);border:1px solid var(--border-default);border-radius:var(--radius-lg);background:var(--surface)}
.lbb-metric-label{font-size:var(--text-meta);text-transform:uppercase;letter-spacing:var(--tracking-wide);color:var(--text-muted)}
.lbb-metric-value{font-family:var(--font-mono);font-size:var(--text-display);font-weight:var(--weight-medium);color:var(--text-strong);line-height:var(--leading-tight)}
.lbb-metric-hint{font-size:var(--text-meta);color:var(--text-secondary)}
`;

export interface MetricCardProps extends HTMLAttributes<HTMLDivElement> {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly hint?: ReactNode;
}

/**
 * Número de destaque — contagem de questões, tamanho do cache, duração do último render.
 *
 * O valor usa mono: números em largura fixa alinham entre cards, e a comparação vertical é o
 * ponto de existir um painel de métricas.
 */
export function MetricCard({ label, value, hint, ...rest }: MetricCardProps) {
  injectCss("lbb-metric-css", CSS);

  return (
    <div className="lbb-metric" {...rest}>
      <span className="lbb-metric-label">{label}</span>
      <span className="lbb-metric-value">{value}</span>
      {hint && <span className="lbb-metric-hint">{hint}</span>}
    </div>
  );
}

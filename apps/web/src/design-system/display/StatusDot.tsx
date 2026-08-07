import type { HTMLAttributes } from "react";

import { injectCss } from "../shared/inject-css";

const CSS = `
.lbb-dot{display:inline-flex;align-items:center;gap:6px;font-size:var(--text-body-sm);color:var(--text-secondary)}
.lbb-dot-mark{width:7px;height:7px;border-radius:var(--radius-pill);flex-shrink:0}
.lbb-dot[data-pulse="true"] .lbb-dot-mark{animation:lbb-pulse 1.6s ease-in-out infinite}
@keyframes lbb-pulse{0%,100%{opacity:1}50%{opacity:.35}}
`;

const TONES = {
  neutral: "var(--text-muted)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  info: "var(--info)",
  ai: "var(--ai)",
} as const;

export type StatusTone = keyof typeof TONES;

export interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
  readonly tone?: StatusTone;
  readonly label?: string;
  /** Pulsa enquanto algo está em andamento — render, import, chamada ao agente. */
  readonly pulse?: boolean;
}

/**
 * Estado com cor **e** rótulo. Cor sozinha exclui quem não a distingue, e a statusbar é
 * justamente onde a informação precisa ser lida de relance.
 */
export function StatusDot({ tone = "neutral", label, pulse = false, ...rest }: StatusDotProps) {
  injectCss("lbb-dot-css", CSS);

  return (
    <span className="lbb-dot" data-pulse={pulse ? "true" : "false"} {...rest}>
      <span className="lbb-dot-mark" style={{ background: TONES[tone] }} aria-hidden="true" />
      {label}
    </span>
  );
}

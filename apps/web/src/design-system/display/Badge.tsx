import type { HTMLAttributes, ReactNode } from "react";

import { injectCss } from "../shared/inject-css";

const CSS = `
.lbb-badge{display:inline-flex;align-items:center;gap:5px;height:20px;padding:0 8px;border-radius:var(--radius-pill);border:1px solid;font-size:var(--text-body-sm);font-weight:var(--weight-medium);white-space:nowrap}
.lbb-badge[data-mono="true"]{font-family:var(--font-mono);font-size:var(--text-meta)}
`;

/**
 * Tom por **namespace**: `status.*`, `ai.*` e `accent.*` nunca se misturam.
 *
 * O `pedagogy.*` do DS de origem saiu — não existe neste domínio.
 */
const TONES = {
  neutral: {
    fg: "var(--text-secondary)",
    bg: "var(--surface-sunken)",
    bd: "var(--border-default)",
  },
  accent: { fg: "var(--accent-text)", bg: "var(--accent-surface)", bd: "var(--accent-border)" },
  ok: { fg: "var(--ok-text)", bg: "var(--ok-surface)", bd: "var(--ok-border)" },
  warn: { fg: "var(--warn-text)", bg: "var(--warn-surface)", bd: "var(--warn-border)" },
  danger: { fg: "var(--danger-text)", bg: "var(--danger-surface)", bd: "var(--danger-border)" },
  info: { fg: "var(--info-text)", bg: "var(--info-surface)", bd: "var(--info-border)" },
  ai: { fg: "var(--ai-text)", bg: "var(--ai-surface)", bd: "var(--ai-border)" },
  warm: {
    fg: "var(--accent-warm-text)",
    bg: "var(--accent-warm-surface)",
    bd: "var(--accent-warm-border)",
  },
} as const;

export type BadgeTone = keyof typeof TONES;
export const BADGE_TONES = Object.keys(TONES) as readonly BadgeTone[];

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly tone?: BadgeTone;
  readonly mono?: boolean;
  readonly children?: ReactNode;
}

export function Badge({ tone = "neutral", mono = false, style, children, ...rest }: BadgeProps) {
  injectCss("lbb-badge-css", CSS);
  const t = TONES[tone];

  return (
    <span
      className="lbb-badge"
      data-mono={mono ? "true" : "false"}
      style={{ color: t.fg, background: t.bg, borderColor: t.bd, ...style }}
      {...rest}
    >
      {children}
    </span>
  );
}

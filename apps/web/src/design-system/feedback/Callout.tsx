import type { HTMLAttributes, ReactNode } from "react";

import { Icon, type IconName } from "../Icon";
import { injectCss } from "../shared/inject-css";

const CSS = `
.lbb-callout{display:flex;gap:8px;padding:var(--space-3);border:1px solid;border-radius:var(--radius-md);font-size:var(--text-body-sm);line-height:var(--leading-normal)}
.lbb-callout-body{display:flex;flex-direction:column;gap:2px;min-width:0}
.lbb-callout-title{font-weight:var(--weight-medium)}
`;

const TONES = {
  info: {
    fg: "var(--info-text)",
    bg: "var(--info-surface)",
    bd: "var(--info-border)",
    icon: "circle-alert",
  },
  ok: {
    fg: "var(--ok-text)",
    bg: "var(--ok-surface)",
    bd: "var(--ok-border)",
    icon: "circle-check",
  },
  warn: {
    fg: "var(--warn-text)",
    bg: "var(--warn-surface)",
    bd: "var(--warn-border)",
    icon: "triangle-alert",
  },
  danger: {
    fg: "var(--danger-text)",
    bg: "var(--danger-surface)",
    bd: "var(--danger-border)",
    icon: "circle-x",
  },
  ai: { fg: "var(--ai-text)", bg: "var(--ai-surface)", bd: "var(--ai-border)", icon: "sparkles" },
} as const satisfies Record<string, { fg: string; bg: string; bd: string; icon: IconName }>;

export type CalloutTone = keyof typeof TONES;

export interface CalloutProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  readonly tone?: CalloutTone;
  readonly title?: ReactNode;
  readonly children?: ReactNode;
}

/**
 * Aviso ancorado no conteúdo — "Preview rápido pode diferir do PDF final", diagnóstico de
 * compilação, alerta do agente.
 *
 * `danger` e `warn` recebem `role="alert"`: são os casos em que a informação muda o que o
 * usuário deveria fazer a seguir.
 */
export function Callout({ tone = "info", title, children, ...rest }: CalloutProps) {
  injectCss("lbb-callout-css", CSS);
  const t = TONES[tone];

  return (
    <div
      className="lbb-callout"
      role={tone === "danger" || tone === "warn" ? "alert" : undefined}
      style={{ color: t.fg, background: t.bg, borderColor: t.bd }}
      {...rest}
    >
      <Icon name={t.icon} size={15} style={{ marginTop: 1 }} />
      <span className="lbb-callout-body">
        {title && <span className="lbb-callout-title">{title}</span>}
        {children}
      </span>
    </div>
  );
}

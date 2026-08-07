import type { HTMLAttributes, ReactNode } from "react";

import { Icon, type IconName } from "../Icon";
import { IconButton } from "../forms/IconButton";
import { injectCss } from "../shared/inject-css";

const CSS = `
.lbb-banner{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid;border-radius:var(--radius-md);font-size:var(--text-body);line-height:var(--leading-normal)}
.lbb-banner-body{flex:1;min-width:0}
.lbb-banner-title{font-weight:var(--weight-medium);color:var(--text-strong)}
.lbb-banner-icon{flex-shrink:0;display:flex;margin-top:1px}
.lbb-banner-actions{display:flex;gap:var(--space-2);margin-top:var(--space-2)}
`;

const TONES = {
  info: {
    icon: "circle-alert",
    fg: "var(--info-text)",
    bg: "var(--info-surface)",
    bd: "var(--info-border)",
  },
  ok: {
    icon: "circle-check",
    fg: "var(--ok-text)",
    bg: "var(--ok-surface)",
    bd: "var(--ok-border)",
  },
  warn: {
    icon: "triangle-alert",
    fg: "var(--warn-text)",
    bg: "var(--warn-surface)",
    bd: "var(--warn-border)",
  },
  danger: {
    icon: "triangle-alert",
    fg: "var(--danger-text)",
    bg: "var(--danger-surface)",
    bd: "var(--danger-border)",
  },
  ai: { icon: "sparkles", fg: "var(--ai-text)", bg: "var(--ai-surface)", bd: "var(--ai-border)" },
} as const satisfies Record<string, { icon: IconName; fg: string; bg: string; bd: string }>;

export type BannerTone = keyof typeof TONES;

export interface BannerProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  readonly tone?: BannerTone;
  readonly title?: ReactNode;
  /** Quando presente, mostra o botão de dispensar. Ausente = o aviso não é dispensável. */
  readonly onDismiss?: () => void;
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
}

/**
 * Aviso no escopo da página ou do painel — worker de render indisponível, importação com
 * pendências, chave de IA ausente.
 *
 * Distinção em relação a `Callout`: o `Banner` fala do **ambiente** ("o worker não respondeu");
 * o `Callout` fala do **conteúdo diante dos olhos** ("este preview pode diferir do PDF").
 *
 * `danger` recebe `role="alert"` (interrompe o leitor de tela); os demais, `role="status"`
 * (anuncia na próxima pausa). A regra da spec §22 é que erro que muda o próximo passo do usuário
 * não pode esperar a pausa.
 */
export function Banner({
  tone = "info",
  title,
  onDismiss,
  actions,
  children,
  ...rest
}: BannerProps) {
  injectCss("lbb-banner-css", CSS);
  const t = TONES[tone];

  return (
    <div
      className="lbb-banner"
      role={tone === "danger" ? "alert" : "status"}
      style={{ background: t.bg, borderColor: t.bd }}
      {...rest}
    >
      <span className="lbb-banner-icon" style={{ color: t.fg }}>
        <Icon name={t.icon} size={15} />
      </span>
      <div className="lbb-banner-body">
        {title && <div className="lbb-banner-title">{title}</div>}
        <div style={{ color: "var(--text-primary)" }}>{children}</div>
        {actions && <div className="lbb-banner-actions">{actions}</div>}
      </div>
      {onDismiss && (
        <IconButton icon="x" size="sm" aria-label="Dispensar aviso" onClick={onDismiss} />
      )}
    </div>
  );
}

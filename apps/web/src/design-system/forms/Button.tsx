import type { ButtonHTMLAttributes, ReactNode } from "react";

import { Icon, type IconName } from "../Icon";
import { injectCss } from "../shared/inject-css";

const CSS = `
.lbb-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid transparent;border-radius:var(--radius-md);font-family:var(--font-ui);font-weight:var(--weight-medium);cursor:pointer;white-space:nowrap;transition:background var(--motion-fast) var(--ease-standard),border-color var(--motion-fast) var(--ease-standard),color var(--motion-fast) var(--ease-standard)}
.lbb-btn[data-size="sm"]{height:var(--control-h-sm);padding:0 10px;font-size:var(--text-body-sm)}
.lbb-btn[data-size="md"]{height:var(--control-h-md);padding:0 14px;font-size:var(--text-body)}
.lbb-btn[data-size="lg"]{height:var(--control-h-lg);padding:0 18px;font-size:var(--text-body)}
.lbb-btn[data-variant="primary"]{background:var(--accent);color:var(--on-accent)}
.lbb-btn[data-variant="primary"]:hover:not(:disabled){background:var(--accent-hover)}
.lbb-btn[data-variant="primary"]:active:not(:disabled){background:var(--accent-active)}
.lbb-btn[data-variant="secondary"]{background:var(--surface);border-color:var(--border-default);color:var(--text-primary)}
.lbb-btn[data-variant="secondary"]:hover:not(:disabled){border-color:var(--border-strong);background:var(--surface-raised)}
.lbb-btn[data-variant="ghost"]{background:transparent;color:var(--text-secondary)}
.lbb-btn[data-variant="ghost"]:hover:not(:disabled){background:var(--hover-overlay);color:var(--text-primary)}
.lbb-btn[data-variant="danger"]{background:var(--danger);color:var(--text-inverse)}
.lbb-btn[data-variant="danger"]:hover:not(:disabled){background:var(--danger-text)}
.lbb-btn:disabled{opacity:var(--disabled-opacity);cursor:not-allowed}
.lbb-btn:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}
`;

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ControlSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  readonly variant?: ButtonVariant;
  readonly size?: ControlSize;
  readonly icon?: IconName;
  readonly loading?: boolean;
  readonly children?: ReactNode;
}

/**
 * Rótulo de ação sempre específico — "Renderizar questão", "Aplicar patch" — nunca "OK" ou
 * "Enviar". Um botão que não diz o que faz obriga o usuário a reconstruir o contexto.
 *
 * `primary` é o acento: no máximo um por área.
 */
export function Button({
  variant = "secondary",
  size = "md",
  icon,
  loading = false,
  disabled,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  injectCss("lbb-btn-css", CSS);

  return (
    <button
      type={type}
      className="lbb-btn"
      data-variant={variant}
      data-size={size}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Icon name="loader" style={{ animation: "lbb-spin .9s linear infinite" }} />
      ) : icon ? (
        <Icon name={icon} />
      ) : null}
      {children}
    </button>
  );
}

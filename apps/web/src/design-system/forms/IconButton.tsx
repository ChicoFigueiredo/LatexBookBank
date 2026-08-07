import type { ButtonHTMLAttributes } from "react";

import { Icon, type IconName } from "../Icon";
import { injectCss } from "../shared/inject-css";
import type { ControlSize } from "./Button";

const CSS = `
.lbb-iconbtn{display:inline-flex;align-items:center;justify-content:center;border:1px solid transparent;border-radius:var(--radius-md);background:transparent;color:var(--text-secondary);cursor:pointer;transition:background var(--motion-fast) var(--ease-standard),color var(--motion-fast) var(--ease-standard)}
.lbb-iconbtn[data-size="sm"]{width:var(--control-h-sm);height:var(--control-h-sm)}
.lbb-iconbtn[data-size="md"]{width:var(--control-h-md);height:var(--control-h-md)}
.lbb-iconbtn[data-size="lg"]{width:var(--control-h-lg);height:var(--control-h-lg)}
.lbb-iconbtn:hover:not(:disabled){background:var(--hover-overlay);color:var(--text-primary)}
.lbb-iconbtn[data-variant="outline"]{border-color:var(--border-default);background:var(--surface)}
.lbb-iconbtn[data-variant="outline"]:hover:not(:disabled){border-color:var(--border-strong)}
.lbb-iconbtn[data-variant="danger"]{color:var(--danger-text)}
.lbb-iconbtn[data-variant="danger"]:hover:not(:disabled){background:var(--danger-surface)}
.lbb-iconbtn:disabled{opacity:var(--disabled-opacity);cursor:not-allowed}
.lbb-iconbtn:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}
`;

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly icon: IconName;
  /** Obrigatório: o ícone nunca fala sozinho. */
  readonly "aria-label": string;
  readonly variant?: "ghost" | "outline" | "danger";
  readonly size?: ControlSize;
}

/** O `aria-label` é obrigatório no tipo — um botão só de ícone sem rótulo é invisível a leitores. */
export function IconButton({
  icon,
  "aria-label": ariaLabel,
  variant = "ghost",
  size = "md",
  type = "button",
  ...rest
}: IconButtonProps) {
  injectCss("lbb-iconbtn-css", CSS);

  return (
    <button
      type={type}
      className="lbb-iconbtn"
      data-variant={variant}
      data-size={size}
      aria-label={ariaLabel}
      title={ariaLabel}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}

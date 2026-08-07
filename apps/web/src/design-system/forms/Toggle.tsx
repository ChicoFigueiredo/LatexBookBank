import type { ButtonHTMLAttributes, ReactNode } from "react";

import { injectCss } from "../shared/inject-css";

const CSS = `
.lbb-toggle{display:inline-flex;align-items:center;gap:8px;background:none;border:0;padding:0;cursor:pointer;font-size:var(--text-body);color:var(--text-primary);font-family:var(--font-ui)}
.lbb-toggle-track{position:relative;width:34px;height:19px;border-radius:var(--radius-pill);background:var(--border-default);transition:background var(--motion-fast) var(--ease-standard);flex-shrink:0}
.lbb-toggle[aria-checked="true"] .lbb-toggle-track{background:var(--accent)}
.lbb-toggle-thumb{position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:var(--radius-pill);background:var(--surface);box-shadow:var(--shadow-sm);transition:transform var(--motion-fast) var(--ease-standard)}
.lbb-toggle[aria-checked="true"] .lbb-toggle-thumb{transform:translateX(15px)}
.lbb-toggle:focus-visible .lbb-toggle-track{outline:2px solid var(--focus-ring);outline-offset:2px}
.lbb-toggle:disabled{opacity:var(--disabled-opacity);cursor:not-allowed}
`;

export interface ToggleProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange" | "type"
> {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label?: ReactNode;
}

/**
 * `role="switch"` em vez de checkbox: o toggle aplica efeito imediato — minimap ligado, tema
 * escuro — enquanto checkbox implica confirmar depois. Leitores de tela anunciam a diferença.
 */
export function Toggle({ checked, onChange, label, disabled, ...rest }: ToggleProps) {
  injectCss("lbb-toggle-css", CSS);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="lbb-toggle"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      {...rest}
    >
      <span className="lbb-toggle-track">
        <span className="lbb-toggle-thumb" />
      </span>
      {label}
    </button>
  );
}

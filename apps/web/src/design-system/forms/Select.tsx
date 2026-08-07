import { forwardRef, type SelectHTMLAttributes } from "react";

import { injectCss } from "../shared/inject-css";
import type { ControlSize } from "./Button";

const CSS = `
.lbb-select{display:block;width:100%;border:1px solid var(--border-default);border-radius:var(--radius-md);background:var(--surface);color:var(--text-primary);font-family:var(--font-ui);cursor:pointer;appearance:none;background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);background-position:calc(100% - 15px) 55%,calc(100% - 11px) 55%;background-size:4px 4px,4px 4px;background-repeat:no-repeat;padding-right:28px}
.lbb-select[data-size="sm"]{height:var(--control-h-sm);padding-left:8px;font-size:var(--text-body-sm)}
.lbb-select[data-size="md"]{height:var(--control-h-md);padding-left:10px;font-size:var(--text-body)}
.lbb-select[data-size="lg"]{height:var(--control-h-lg);padding-left:12px;font-size:var(--text-body)}
.lbb-select:hover:not(:disabled){border-color:var(--border-strong)}
.lbb-select:focus-visible{outline:2px solid var(--focus-ring);outline-offset:1px;border-color:var(--accent)}
.lbb-select[aria-invalid="true"]{border-color:var(--danger);background-color:var(--danger-surface)}
.lbb-select:disabled{opacity:var(--disabled-opacity);cursor:not-allowed;background-color:var(--surface-sunken)}
`;

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  readonly size?: ControlSize;
  readonly invalid?: boolean;
}

/**
 * `<select>` nativo, estilizado.
 *
 * Não é um dropdown customizado de propósito: o nativo já traz teclado, busca por digitação e o
 * seletor do sistema no mobile. Onde precisar de busca ou de opções ricas, o certo é `Combobox`,
 * não reescrever isto.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { size = "md", invalid = false, children, ...rest },
  ref,
) {
  injectCss("lbb-select-css", CSS);

  return (
    <select
      ref={ref}
      className="lbb-select"
      data-size={size}
      aria-invalid={invalid || rest["aria-invalid"] || undefined}
      {...rest}
    >
      {children}
    </select>
  );
});

import { forwardRef, type InputHTMLAttributes } from "react";

import { injectCss } from "../shared/inject-css";
import type { ControlSize } from "./Button";

const CSS = `
.lbb-input{display:block;width:100%;border:1px solid var(--border-default);border-radius:var(--radius-md);background:var(--surface);color:var(--text-primary);font-family:var(--font-ui);transition:border-color var(--motion-fast) var(--ease-standard)}
.lbb-input[data-size="sm"]{height:var(--control-h-sm);padding:0 8px;font-size:var(--text-body-sm)}
.lbb-input[data-size="md"]{height:var(--control-h-md);padding:0 10px;font-size:var(--text-body)}
.lbb-input[data-size="lg"]{height:var(--control-h-lg);padding:0 12px;font-size:var(--text-body)}
.lbb-input::placeholder{color:var(--text-muted)}
.lbb-input:hover:not(:disabled){border-color:var(--border-strong)}
.lbb-input:focus-visible{outline:2px solid var(--focus-ring);outline-offset:1px;border-color:var(--accent)}
.lbb-input[aria-invalid="true"]{border-color:var(--danger);background:var(--danger-surface)}
.lbb-input:disabled{opacity:var(--disabled-opacity);cursor:not-allowed;background:var(--surface-sunken)}
.lbb-input[data-mono="true"]{font-family:var(--font-mono);font-size:var(--text-body-sm)}
`;

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  readonly size?: ControlSize;
  /** Largura fixa para LaTeX, ids e códigos — onde o alinhamento carrega informação. */
  readonly mono?: boolean;
  readonly invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = "md", mono = false, invalid = false, ...rest },
  ref,
) {
  injectCss("lbb-input-css", CSS);

  return (
    <input
      ref={ref}
      className="lbb-input"
      data-size={size}
      data-mono={mono ? "true" : "false"}
      aria-invalid={invalid || rest["aria-invalid"] || undefined}
      {...rest}
    />
  );
});

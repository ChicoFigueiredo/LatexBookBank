import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

import { injectCss } from "../shared/inject-css";

const CSS = `
.lbb-check{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--text-body);color:var(--text-primary)}
.lbb-check input{width:15px;height:15px;accent-color:var(--accent);cursor:pointer;flex-shrink:0;margin:0}
.lbb-check input:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}
.lbb-check:has(input:disabled){opacity:var(--disabled-opacity);cursor:not-allowed}
`;

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  readonly label?: ReactNode;
}

/** O rótulo envolve o input, então clicar no texto alterna — área de toque maior, de graça. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, ...rest },
  ref,
) {
  injectCss("lbb-check-css", CSS);

  return (
    <label className="lbb-check">
      <input ref={ref} type="checkbox" {...rest} />
      {label}
    </label>
  );
});

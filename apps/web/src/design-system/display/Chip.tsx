import type { HTMLAttributes, ReactNode } from "react";

import { Icon } from "../Icon";
import { injectCss } from "../shared/inject-css";

const CSS = `
.lbb-chip{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border-radius:var(--radius-sm);border:1px solid var(--border-default);background:var(--surface-raised);color:var(--text-primary);font-size:var(--text-body-sm);white-space:nowrap}
.lbb-chip[data-selected="true"]{background:var(--accent-surface);border-color:var(--accent-border);color:var(--accent-text)}
.lbb-chip-remove{display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;color:inherit;cursor:pointer;padding:0;margin-right:-2px;opacity:.65}
.lbb-chip-remove:hover{opacity:1}
.lbb-chip-remove:focus-visible{outline:2px solid var(--focus-ring);outline-offset:1px;border-radius:var(--radius-sm)}
`;

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  readonly selected?: boolean;
  /** Quando presente, o chip ganha um botão de remoção com rótulo próprio. */
  readonly onRemove?: () => void;
  readonly removeLabel?: string;
  readonly children?: ReactNode;
}

/** Tag, filtro aplicado, item de contexto do agente. */
export function Chip({ selected = false, onRemove, removeLabel, children, ...rest }: ChipProps) {
  injectCss("lbb-chip-css", CSS);

  return (
    <span className="lbb-chip" data-selected={selected ? "true" : "false"} {...rest}>
      {children}
      {onRemove && (
        <button
          type="button"
          className="lbb-chip-remove"
          // Sem rótulo próprio, "remover" não diz o quê — e numa lista de tags há vários.
          aria-label={removeLabel ?? `Remover ${typeof children === "string" ? children : "item"}`}
          onClick={onRemove}
        >
          <Icon name="x" size={12} />
        </button>
      )}
    </span>
  );
}

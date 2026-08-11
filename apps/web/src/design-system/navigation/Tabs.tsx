"use client";

import { useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

import { injectCss } from "../shared/inject-css";

const CSS = `
.lbb-tabs{display:flex;gap:2px;border-bottom:1px solid var(--border-default)}
.lbb-tab{position:relative;display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 12px;border:none;background:transparent;color:var(--text-secondary);font:inherit;font-size:var(--text-body);cursor:pointer;transition:color var(--motion-fast) var(--ease-standard)}
.lbb-tab:hover{color:var(--text-primary)}
.lbb-tab:focus-visible{outline:2px solid var(--focus-ring);outline-offset:-2px;border-radius:var(--radius-sm)}
.lbb-tab[aria-selected="true"]{color:var(--accent-text);font-weight:var(--weight-medium)}
.lbb-tab[aria-selected="true"]::after{content:"";position:absolute;left:8px;right:8px;bottom:-1px;height:2px;border-radius:1px;background:var(--accent)}
.lbb-tab-count{font-family:var(--font-mono);font-size:var(--text-meta);color:var(--text-muted)}
`;

export interface TabItem {
  readonly id: string;
  readonly label: ReactNode;
  /** Contagem em mono à direita do rótulo — diagnósticos, alternativas, resultados. */
  readonly count?: number;
}

export interface TabsProps {
  readonly tabs: readonly TabItem[];
  readonly value: string;
  readonly onChange?: (id: string) => void;
  readonly "aria-label"?: string;
}

/**
 * Navegação intra-painel: Conteúdo · Resposta · Complemento · Metadados · Origem no editor
 * (spec §10), e PDF · PNG · Log · Source no preview (spec §12).
 *
 * Só a aba selecionada é tabulável (`tabIndex` 0/-1) e as setas movem entre elas — é o padrão
 * ARIA de tablist, e o que impede que Tab tenha de percorrer cinco abas para chegar ao editor.
 */
export function Tabs({ tabs, value, onChange, "aria-label": ariaLabel }: TabsProps) {
  injectCss("lbb-tabs-css", CSS);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(
    0,
    tabs.findIndex((t) => t.id === value),
  );

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (tabs.length === 0) return;

    let next: number | null = null;
    if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next == null) return;

    const target = tabs[next];
    if (!target) return;

    event.preventDefault();
    onChange?.(target.id);
    refs.current[next]?.focus();
  };

  return (
    <div
      className="lbb-tabs"
      role="tablist"
      {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
      onKeyDown={handleKeyDown}
    >
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          ref={(el) => {
            refs.current[index] = el;
          }}
          className="lbb-tab"
          role="tab"
          aria-selected={tab.id === value}
          tabIndex={tab.id === value ? 0 : -1}
          onClick={() => onChange?.(tab.id)}
        >
          {tab.label}
          {tab.count != null && <span className="lbb-tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

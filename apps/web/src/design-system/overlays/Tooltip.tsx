"use client";

import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactElement, ReactNode } from "react";

import { injectCss } from "../shared/inject-css";

const CSS = `
.lbb-tip{z-index:var(--z-dropdown);max-width:280px;padding:5px 8px;border-radius:var(--radius-sm);background:var(--text-strong);color:var(--text-inverse);font-family:var(--font-ui);font-size:var(--text-body-sm);line-height:var(--leading-tight);box-shadow:var(--shadow-md)}
.lbb-tip-kbd{font-family:var(--font-mono);font-size:var(--text-micro);opacity:.75;margin-left:6px}
.lbb-tip-arrow{fill:var(--text-strong)}
@media (prefers-reduced-motion: no-preference){
  .lbb-tip[data-state="delayed-open"]{animation:lbb-tip-in var(--motion-fast) var(--ease-standard)}
}
@keyframes lbb-tip-in{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
`;

/**
 * Provedor de tooltips. Precisa existir **uma vez** acima de qualquer `Tooltip`.
 *
 * O `Workbench` já monta um. Ele existe exportado para telas que não usam o shell — e é o que
 * dá o "skip delay": depois do primeiro tooltip, percorrer a barra de ferramentas mostra os
 * seguintes na hora, em vez de esperar 500 ms a cada botão.
 */
export function TooltipProvider({ children }: { readonly children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={450} skipDelayDuration={300}>
      {children}
    </RadixTooltip.Provider>
  );
}

export interface TooltipProps {
  readonly label: ReactNode;
  /** Atalho em mono à direita — "Ctrl+S", "F2". */
  readonly shortcut?: string;
  readonly side?: "top" | "right" | "bottom" | "left";
  readonly children: ReactElement;
}

/**
 * Dica sobre um controle já rotulado.
 *
 * **Nunca é o único portador da informação.** O tooltip não aparece no toque, some ao mexer o
 * ponteiro e não é lido em toda navegação por leitor de tela. Se um controle só se explica pelo
 * tooltip, o problema é o rótulo dele — a regra da spec §34 é que nada essencial dependa de
 * hover. Aqui ele serve para o acessório: o atalho, a unidade, o nome inteiro do que foi cortado
 * por reticências.
 *
 * O Radix entra headless: layout, foco e posicionamento vêm dele, e cada pixel de aparência sai
 * de `var(--token)` (D13). Nenhum CSS de terceiro entra no bundle.
 */
export function Tooltip({ label, shortcut, side = "top", children }: TooltipProps) {
  injectCss("lbb-tip-css", CSS);

  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content className="lbb-tip" side={side} sideOffset={6}>
          {label}
          {shortcut && <span className="lbb-tip-kbd">{shortcut}</span>}
          <RadixTooltip.Arrow className="lbb-tip-arrow" width={10} height={5} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

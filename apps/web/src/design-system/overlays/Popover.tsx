"use client";

import * as RadixPopover from "@radix-ui/react-popover";
import type { ReactElement, ReactNode } from "react";

import { injectCss } from "../shared/inject-css";

const CSS = `
.lbb-pop{z-index:var(--z-dropdown);min-width:220px;max-width:min(420px, calc(100vw - 24px));border:1px solid var(--border-default);border-radius:var(--radius-md);background:var(--surface-overlay);box-shadow:var(--shadow-md);font-family:var(--font-ui);font-size:var(--text-body);color:var(--text-primary)}
.lbb-pop-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px 0}
.lbb-pop-title{font-family:var(--font-mono);font-size:var(--text-micro);font-weight:var(--weight-medium);letter-spacing:var(--tracking-wide);text-transform:uppercase;color:var(--text-secondary)}
.lbb-pop-body{padding:10px 12px 12px}
.lbb-pop-arrow{fill:var(--surface-overlay);stroke:var(--border-default)}
@media (prefers-reduced-motion: no-preference){
  .lbb-pop[data-state="open"]{animation:lbb-pop-in var(--motion-fast) var(--ease-standard)}
}
@keyframes lbb-pop-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
`;

export interface PopoverProps {
  readonly trigger: ReactElement;
  readonly title?: ReactNode;
  readonly side?: "top" | "right" | "bottom" | "left";
  readonly align?: "start" | "center" | "end";
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly children: ReactNode;
}

/**
 * Painel ancorado a um gatilho — filtros da árvore, metadados rápidos, seletor de perfil de
 * render.
 *
 * A diferença em relação ao `Modal` não é o tamanho: o popover **não bloqueia** o resto da tela.
 * Serve para o que é auxiliar e reversível. Escolha que precisa de atenção exclusiva — aplicar
 * patch do agente, excluir nó — vai para `Modal`, que prende o foco de propósito.
 *
 * Radix headless (D13): foco, `aria-expanded` no gatilho, Escape e clique fora vêm dele; a
 * aparência sai só de tokens.
 */
export function Popover({
  trigger,
  title,
  side = "bottom",
  align = "start",
  open,
  onOpenChange,
  children,
}: PopoverProps) {
  injectCss("lbb-pop-css", CSS);

  return (
    <RadixPopover.Root
      {...(open !== undefined ? { open } : {})}
      {...(onOpenChange ? { onOpenChange } : {})}
    >
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          className="lbb-pop"
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
        >
          {title && (
            <div className="lbb-pop-head">
              <span className="lbb-pop-title">{title}</span>
            </div>
          )}
          <div className="lbb-pop-body">{children}</div>
          <RadixPopover.Arrow className="lbb-pop-arrow" width={10} height={5} />
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}

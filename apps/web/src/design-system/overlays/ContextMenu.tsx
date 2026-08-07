"use client";

import * as RadixContextMenu from "@radix-ui/react-context-menu";
import type { ReactNode } from "react";

import { Icon, type IconName } from "../Icon";
import { injectCss } from "../shared/inject-css";

const CSS = `
.lbb-ctx{z-index:var(--z-dropdown);min-width:200px;padding:4px;border:1px solid var(--border-default);border-radius:var(--radius-md);background:var(--surface-overlay);box-shadow:var(--shadow-md);font-family:var(--font-ui);font-size:var(--text-body)}
.lbb-ctx-item{display:flex;align-items:center;gap:8px;height:30px;padding:0 8px;border-radius:var(--radius-sm);color:var(--text-primary);cursor:pointer;outline:none;user-select:none}
.lbb-ctx-item[data-highlighted]{background:var(--accent-surface);color:var(--accent-text)}
.lbb-ctx-item[data-tone="danger"]{color:var(--danger-text)}
.lbb-ctx-item[data-tone="danger"][data-highlighted]{background:var(--danger-surface);color:var(--danger-text)}
.lbb-ctx-item[data-disabled]{color:var(--text-disabled);cursor:not-allowed}
.lbb-ctx-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lbb-ctx-shortcut{font-family:var(--font-mono);font-size:var(--text-meta);color:var(--text-muted)}
.lbb-ctx-item[data-highlighted] .lbb-ctx-shortcut{color:inherit;opacity:.8}
.lbb-ctx-sep{height:1px;margin:4px 6px;background:var(--border-subtle)}
`;

export interface ContextMenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconName;
  /** Atalho em mono. Só declarativo — quem o registra é a tela, não o menu. */
  readonly shortcut?: string;
  readonly disabled?: boolean;
  readonly tone?: "default" | "danger";
  readonly onSelect?: () => void;
}

export interface ContextMenuProps {
  /**
   * Grupos de itens. O separador é **derivado** do agrupamento, nunca declarado item a item —
   * assim não existe separador solto no topo nem duas linhas seguidas quando um grupo fica vazio.
   */
  readonly groups: readonly (readonly ContextMenuItem[])[];
  readonly children: ReactNode;
  readonly "aria-label"?: string;
}

/**
 * Menu de contexto — o da árvore, na Fase 2: criar filho, criar irmão, renomear, duplicar,
 * excluir (spec §4.1).
 *
 * É uma das três lacunas do DS de origem (D13). O Radix entra **headless**: teclado, foco,
 * posicionamento contra a borda da janela e fechamento no Escape vêm dele; a aparência inteira
 * sai de tokens. Escrever isso à mão significaria reimplementar navegação por digitação,
 * `aria-activedescendant` e colisão de viewport — e errar em algum deles.
 *
 * Ações destrutivas ganham `tone: "danger"` e ficam no último grupo, longe do cursor quando o
 * menu abre. O menu não confirma nada: confirmação é da tela, num `Modal`.
 */
export function ContextMenu({ groups, children, "aria-label": ariaLabel }: ContextMenuProps) {
  injectCss("lbb-ctx-css", CSS);
  const visible = groups.filter((group) => group.length > 0);

  return (
    <RadixContextMenu.Root>
      <RadixContextMenu.Trigger asChild>{children}</RadixContextMenu.Trigger>
      <RadixContextMenu.Portal>
        <RadixContextMenu.Content
          className="lbb-ctx"
          collisionPadding={8}
          {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
        >
          {visible.map((group, groupIndex) => (
            <RadixContextMenu.Group key={group[0]?.id ?? groupIndex}>
              {groupIndex > 0 && <RadixContextMenu.Separator className="lbb-ctx-sep" />}
              {group.map((item) => (
                <RadixContextMenu.Item
                  key={item.id}
                  className="lbb-ctx-item"
                  data-tone={item.tone ?? "default"}
                  disabled={item.disabled ?? false}
                  onSelect={() => item.onSelect?.()}
                >
                  {item.icon && <Icon name={item.icon} size={14} />}
                  <span className="lbb-ctx-label">{item.label}</span>
                  {item.shortcut && <span className="lbb-ctx-shortcut">{item.shortcut}</span>}
                </RadixContextMenu.Item>
              ))}
            </RadixContextMenu.Group>
          ))}
        </RadixContextMenu.Content>
      </RadixContextMenu.Portal>
    </RadixContextMenu.Root>
  );
}

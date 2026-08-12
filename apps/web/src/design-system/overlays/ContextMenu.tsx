"use client";

import * as RadixContextMenu from "@radix-ui/react-context-menu";
import type { ReactNode } from "react";

import { Icon, type IconName } from "../Icon";
import { injectCss } from "../shared/inject-css";
import { MENU_CSS, MENU_CSS_ID } from "./menu-css";

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
  injectCss(MENU_CSS_ID, MENU_CSS);
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

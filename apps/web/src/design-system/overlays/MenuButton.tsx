"use client";

import * as RadixPopover from "@radix-ui/react-popover";
import { useState } from "react";

import { Icon, type IconName } from "../Icon";
import { IconButton } from "../forms/IconButton";
import { injectCss } from "../shared/inject-css";
import { MENU_CSS, MENU_CSS_ID } from "./menu-css";

const CSS = `
.lbb-menubtn{padding:4px}
.lbb-menubtn-list{display:flex;flex-direction:column}
`;

export interface MenuButtonItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconName;
  readonly disabled?: boolean;
  readonly tone?: "default" | "danger";
  readonly onSelect: () => void;
}

export interface MenuButtonProps {
  /** Grupos de itens. O separador é derivado do agrupamento — mesma regra do `ContextMenu`. */
  readonly groups: readonly (readonly MenuButtonItem[])[];
  /** O ícone nunca fala sozinho: "Ações da biblioteca Matemática", não "Menu". */
  readonly "aria-label": string;
  readonly icon?: IconName;
  readonly align?: "start" | "center" | "end";
}

/**
 * Menu de três pontos — o irmão visível do `ContextMenu`.
 *
 * Os dois existem porque o botão direito é **invisível**: quem não sabe que ele abre menu não
 * descobre. Na árvore isso é aceitável, porque é a área onde o usuário passa o tempo todo e o
 * atalho se aprende uma vez. Num card de biblioteca, não: a exclusão precisa estar alcançável no
 * primeiro dia, sem ninguém ter contado.
 *
 * Sobre o `Popover` do Radix, e não sobre um `DropdownMenu`, porque o pacote de popover já está
 * aqui — dele vêm foco, Escape, clique fora, colisão com a borda e `aria-expanded` no gatilho. O
 * que o dropdown daria a mais é a navegação por setas; num menu de dois itens, o Tab resolve, e
 * não vale trazer uma dependência inteira para isso.
 */
export function MenuButton({
  groups,
  "aria-label": ariaLabel,
  icon = "more-horizontal",
  align = "end",
}: MenuButtonProps) {
  injectCss(MENU_CSS_ID, MENU_CSS);
  injectCss("lbb-menubtn-css", CSS);

  const [open, setOpen] = useState(false);
  const visible = groups.filter((group) => group.length > 0);

  return (
    <RadixPopover.Root open={open} onOpenChange={setOpen}>
      <RadixPopover.Trigger asChild>
        <IconButton icon={icon} aria-label={ariaLabel} size="sm" />
      </RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          className="lbb-ctx lbb-menubtn"
          role="menu"
          aria-label={ariaLabel}
          align={align}
          side="bottom"
          sideOffset={4}
          collisionPadding={8}
        >
          <div className="lbb-menubtn-list">
            {visible.map((group, groupIndex) => (
              <div key={group[0]?.id ?? groupIndex} className="lbb-menubtn-list" role="group">
                {groupIndex > 0 && <div className="lbb-ctx-sep" role="separator" />}
                {group.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    className="lbb-ctx-item"
                    data-tone={item.tone ?? "default"}
                    {...(item.disabled ? { "data-disabled": "" } : {})}
                    disabled={item.disabled ?? false}
                    onClick={() => {
                      // Fecha **antes** de agir: a ação costuma abrir um modal, e um popover
                      // aberto atrás do scrim rouba o foco que o modal acabou de prender.
                      setOpen(false);
                      item.onSelect();
                    }}
                  >
                    {item.icon && <Icon name={item.icon} size={14} />}
                    <span className="lbb-ctx-label">{item.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}

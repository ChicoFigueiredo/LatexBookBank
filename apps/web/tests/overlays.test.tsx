// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  Button,
  ContextMenu,
  Popover,
  Tooltip,
  TooltipProvider,
  type ContextMenuItem,
} from "@/design-system";

/**
 * As três lacunas do DS (D13), cobertas com Radix headless.
 *
 * O que se testa aqui não é o Radix — é o contrato **nosso**: que nada de terceiro estiliza a
 * tela, que o menu de contexto abre com o gesto certo, e que o tooltip não é o único portador
 * de informação.
 */

afterEach(cleanup);

describe("ContextMenu", () => {
  const GROUPS: readonly (readonly ContextMenuItem[])[] = [
    [
      { id: "child", label: "Novo nó filho", icon: "plus", shortcut: "Ctrl+Shift+N" },
      { id: "sibling", label: "Novo irmão", icon: "plus", shortcut: "Ctrl+N" },
    ],
    [{ id: "rename", label: "Renomear", icon: "pencil", shortcut: "F2" }],
    [{ id: "delete", label: "Excluir", icon: "circle-x", tone: "danger", shortcut: "Del" }],
  ];

  const openMenu = (groups = GROUPS) => {
    render(
      <ContextMenu groups={groups}>
        <div data-testid="alvo">Capítulo 1</div>
      </ContextMenu>,
    );
    fireEvent.contextMenu(screen.getByTestId("alvo"));
  };

  it("abre no botão direito e lista os itens", () => {
    openMenu();

    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Novo nó filho/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Excluir/ })).toBeTruthy();
  });

  it("deriva um separador por junta entre grupos — nunca um solto no topo", () => {
    openMenu();
    const menu = screen.getByRole("menu");

    // Três grupos ⇒ duas juntas.
    expect(menu.querySelectorAll(".lbb-ctx-sep")).toHaveLength(2);
    expect(menu.firstElementChild?.querySelector(".lbb-ctx-sep")).toBeNull();
  });

  it("grupo vazio não vira separador órfão", () => {
    openMenu([GROUPS[0] ?? [], [], GROUPS[2] ?? []]);
    expect(screen.getByRole("menu").querySelectorAll(".lbb-ctx-sep")).toHaveLength(1);
  });

  it("marca a ação destrutiva, e ela fica no último grupo", () => {
    openMenu();
    const items = screen.getAllByRole("menuitem");

    expect(items[items.length - 1]?.dataset["tone"]).toBe("danger");
    expect(items.filter((i) => i.dataset["tone"] === "danger")).toHaveLength(1);
  });

  it("chama onSelect do item escolhido", () => {
    const onSelect = vi.fn();
    openMenu([[{ id: "dup", label: "Duplicar", onSelect }]]);

    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicar" }));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("item desabilitado é anunciado como tal", () => {
    openMenu([[{ id: "restore", label: "Restaurar", disabled: true }]]);
    expect(screen.getByRole("menuitem", { name: "Restaurar" }).dataset["disabled"]).toBeDefined();
  });
});

describe("Popover", () => {
  it("o gatilho anuncia o estado e o conteúdo aparece ao abrir", () => {
    render(
      <Popover title="Filtros" trigger={<Button>Filtrar</Button>}>
        <span>só questões inválidas</span>
      </Popover>,
    );

    const trigger = screen.getByRole("button", { name: "Filtrar" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);

    expect(screen.getByText("só questões inválidas")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filtrar" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
  });

  it("controlado por fora quando `open` é passado", () => {
    const onOpenChange = vi.fn();
    render(
      <Popover open={false} onOpenChange={onOpenChange} trigger={<Button>Filtrar</Button>}>
        <span>conteúdo</span>
      </Popover>,
    );

    expect(screen.queryByText("conteúdo")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Filtrar" }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});

describe("Tooltip", () => {
  it("não substitui o rótulo do controle — o gatilho continua nomeado sem ele", () => {
    render(
      <TooltipProvider>
        <Tooltip label="Salva imediatamente" shortcut="Ctrl+S">
          <Button>Salvar</Button>
        </Tooltip>
      </TooltipProvider>,
    );

    // O nome acessível vem do texto do botão, não do tooltip: nada essencial depende de hover.
    expect(screen.getByRole("button", { name: "Salvar" })).toBeTruthy();
  });

  it("aparece no foco, não só no hover", () => {
    render(
      <TooltipProvider>
        <Tooltip label="Salva imediatamente">
          <Button>Salvar</Button>
        </Tooltip>
      </TooltipProvider>,
    );

    fireEvent.focus(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.getAllByText("Salva imediatamente").length).toBeGreaterThan(0);
  });
});

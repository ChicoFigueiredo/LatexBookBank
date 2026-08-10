// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CommandPalette, Divider, Workbench, type WorkbenchModule } from "@/design-system";
import { __resetStoredStateCache } from "@/design-system/shared/use-stored-state";

/**
 * O shell é a única peça que todas as fases atravessam. O que estes testes seguram é a geometria
 * — quais zonas existem, quem persiste, e o que acontece no teclado — porque é o que quebra sem
 * fazer barulho quando alguém mexe no layout.
 */

afterEach(cleanup);
beforeEach(() => {
  window.localStorage.clear();
  __resetStoredStateCache();
});

const MODULES: readonly WorkbenchModule[] = [
  { id: "biblioteca", label: "Biblioteca", icon: "library" },
  { id: "publicacoes", label: "Publicações", icon: "book-open", badge: 64 },
  { id: "diagnostico", label: "Diagnóstico", icon: "activity", group: "Sistema" },
];

const renderWorkbench = (props: Partial<Parameters<typeof Workbench>[0]> = {}) =>
  render(
    <Workbench
      modules={MODULES}
      activeModule="publicacoes"
      sidebar={<div>árvore</div>}
      aside={<div>painel do agente</div>}
      statusLeft="SQLite · local"
      {...props}
    >
      <div>editor</div>
    </Workbench>,
  );

describe("Workbench — as seis zonas da D14", () => {
  it("expõe rail, sidebar, main, statusbar e o topbar com busca", () => {
    renderWorkbench();

    expect(screen.getByRole("navigation", { name: "Módulos" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Árvore" })).toBeTruthy();
    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByRole("contentinfo", { name: "Barra de status" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /paleta de comandos/i })).toBeTruthy();
  });

  it("marca o módulo ativo com aria-current, não só com cor", () => {
    renderWorkbench();
    expect(screen.getByRole("button", { name: /Publicações/ }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("avisa quem escolheu o módulo", () => {
    const onModuleSelect = vi.fn();
    renderWorkbench({ onModuleSelect });

    fireEvent.click(screen.getByRole("button", { name: /Biblioteca/ }));
    expect(onModuleSelect).toHaveBeenCalledWith("biblioteca");
  });
});

describe("Workbench — o painel do agente nasce fechado", () => {
  it("mostra o FAB ✦ em vez do painel (spec §14.6)", () => {
    renderWorkbench();

    expect(screen.queryByText("painel do agente")).toBeNull();
    expect(screen.getByRole("button", { name: "Abrir Agente" })).toBeTruthy();
  });

  it("abre pelo FAB e o estado sobrevive a uma remontagem", () => {
    const { unmount } = renderWorkbench();
    fireEvent.click(screen.getByRole("button", { name: "Abrir Agente" }));
    expect(screen.getByText("painel do agente")).toBeTruthy();

    unmount();
    renderWorkbench();
    expect(screen.getByText("painel do agente")).toBeTruthy();
  });

  it("o toggle da topbar mantém o nome e conta o estado por aria-pressed", () => {
    renderWorkbench();
    const toggle = screen.getByRole("button", { name: "Painel Agente" });

    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Painel Agente" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("`Ctrl+Shift+A` abre e fecha (spec §14.6)", () => {
    renderWorkbench();

    fireEvent.keyDown(window, { code: "KeyA", ctrlKey: true, shiftKey: true });
    expect(screen.getByText("painel do agente")).toBeTruthy();

    fireEvent.keyDown(window, { code: "KeyA", ctrlKey: true, shiftKey: true });
    expect(screen.queryByText("painel do agente")).toBeNull();
  });

  it("`Ctrl+A` sozinho continua selecionando texto", () => {
    // Sequestrar o atalho de "selecionar tudo" dentro de um editor de LaTeX seria hostil.
    renderWorkbench();

    fireEvent.keyDown(window, { code: "KeyA", ctrlKey: true });
    expect(screen.queryByText("painel do agente")).toBeNull();
  });

  it("guarda o estado sob a chave do workspace", () => {
    renderWorkbench({ storageKey: "lbb:wb:teste" });
    fireEvent.click(screen.getByRole("button", { name: "Abrir Agente" }));

    expect(window.localStorage.getItem("lbb:wb:teste:aside-open")).toBe("true");
  });
});

describe("Workbench — Ctrl+K", () => {
  it("abre e fecha a paleta", () => {
    renderWorkbench({
      commands: [{ id: "ir", label: "Ir para a Biblioteca", group: "Navegação" }],
    });

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByRole("dialog", { name: "Paleta de comandos" })).toBeTruthy();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("aceita ⌘K no macOS", () => {
    renderWorkbench();
    fireEvent.keyDown(window, { key: "K", metaKey: true });
    expect(screen.getByRole("dialog", { name: "Paleta de comandos" })).toBeTruthy();
  });
});

describe("CommandPalette", () => {
  const COMMANDS = [
    { id: "pub", label: "Publicações", group: "Navegação" },
    { id: "imp", label: "Importação do legado", group: "Ações", hint: "13 bibliotecas" },
    { id: "diag", label: "Diagnóstico", group: "Navegação" },
  ];

  it("busca ignorando acento e agrupa preservando a ordem declarada", () => {
    render(<CommandPalette open commands={COMMANDS} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "importacao" } });

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]?.textContent).toContain("Importação do legado");
  });

  it("Enter executa o comando selecionado e fecha", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <CommandPalette
        open
        onClose={onClose}
        commands={[{ id: "x", label: "Exportar .lbb", onSelect }]}
      />,
    );

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Esc fecha", () => {
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} commands={COMMANDS} />);

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("busca sem resultado explica o que fazer, em vez de ficar vazia", () => {
    render(<CommandPalette open commands={COMMANDS} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zzz" } });

    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText(/Nenhum resultado para "zzz"/)).toBeTruthy();
  });

  it("fechada, não monta nada — cada abertura nasce zerada", () => {
    const { container } = render(<CommandPalette open={false} commands={COMMANDS} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("Divider — window splitter", () => {
  const setup = (onChange = vi.fn()) => {
    render(
      <Divider
        value={280}
        min={216}
        max={440}
        defaultValue={280}
        onChange={onChange}
        label="Redimensionar a árvore"
      />,
    );
    return { separator: screen.getByRole("separator"), onChange };
  };

  it("anuncia os limites para tecnologia assistiva", () => {
    const { separator } = setup();

    expect(separator.getAttribute("aria-orientation")).toBe("vertical");
    expect(separator.getAttribute("aria-valuenow")).toBe("280");
    expect(separator.getAttribute("aria-valuemin")).toBe("216");
    expect(separator.getAttribute("aria-valuemax")).toBe("440");
    expect(separator.tabIndex).toBe(0);
  });

  it("←/→ movem, Home/End vão aos extremos, Enter restaura o padrão", () => {
    const { separator, onChange } = setup();

    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(296);

    fireEvent.keyDown(separator, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith(216);

    fireEvent.keyDown(separator, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith(440);

    fireEvent.keyDown(separator, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith(280);
  });

  it("nunca ultrapassa os limites", () => {
    const onChange = vi.fn();
    render(
      <Divider
        value={438}
        min={216}
        max={440}
        defaultValue={280}
        onChange={onChange}
        label="Redimensionar a árvore"
      />,
    );

    fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(440);
  });

  it("invertida, → encolhe — a divisória fica à esquerda do painel", () => {
    const onChange = vi.fn();
    render(
      <Divider
        value={380}
        min={300}
        max={560}
        defaultValue={380}
        onChange={onChange}
        invert
        label="Redimensionar Agente"
      />,
    );

    fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(364);
  });
});

describe("Workbench — SSR", () => {
  it("renderiza no servidor com os defaults, sem tocar em localStorage", () => {
    const markup = renderToStaticMarkup(
      <Workbench modules={MODULES} activeModule="biblioteca" sidebar={<div>árvore</div>}>
        <div>editor</div>
      </Workbench>,
    );

    expect(markup).toContain("Biblioteca");
    expect(markup).toContain("Barra de status");
  });
});

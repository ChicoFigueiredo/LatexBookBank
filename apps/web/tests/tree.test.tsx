// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ContextMenu, Tree, type TreeCommand, type TreeNode } from "@/design-system";

/**
 * A árvore é a superfície mais usada do produto — dezenas de nós de relance, o dia inteiro. O que
 * estes testes protegem é o que some sem aviso numa reescrita: a distinção entre **selecionar** e
 * **expandir**, e a ordem de tabulação.
 */

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

const NODES: readonly TreeNode[] = [
  {
    id: "cap-1",
    label: "Capítulo 1 — Funções",
    icon: "book-open",
    children: [
      { id: "sec-1", label: "Seção 1.1", icon: "file-text" },
      { id: "sec-2", label: "Seção 1.2", icon: "file-text" },
    ],
  },
  { id: "cap-2", label: "Capítulo 2 — Limites", icon: "book-open" },
];

/** O nome acessível de um `treeitem` engloba o dos descendentes; o id é o único alvo estável. */
const itemOf = (id: string) =>
  document.querySelector(`[data-node-id="${id}"]`)?.closest("[role=treeitem]") as HTMLElement;

describe("Tree — selecionar não é expandir", () => {
  it("clicar na linha de um capítulo seleciona sem mudar a forma da árvore", () => {
    const onSelect = vi.fn();
    const onExpandedChange = vi.fn();
    render(<Tree nodes={NODES} onSelect={onSelect} onExpandedChange={onExpandedChange} />);

    fireEvent.click(screen.getByText("Capítulo 1 — Funções"));

    expect(onSelect).toHaveBeenCalledWith("cap-1", NODES[0]);
    expect(onExpandedChange).not.toHaveBeenCalled();
    expect(screen.queryByText("Seção 1.1")).toBeNull();
  });

  it("clicar no caret expande sem trocar o nó selecionado", () => {
    const onSelect = vi.fn();
    const { container } = render(<Tree nodes={NODES} onSelect={onSelect} />);

    fireEvent.click(container.querySelector(".lbb-tree-caret") as HTMLElement);

    expect(screen.getByText("Seção 1.1")).toBeTruthy();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("um nó folha não oferece caret clicável", () => {
    const { container } = render(<Tree nodes={NODES} />);
    const carets = container.querySelectorAll<HTMLElement>(".lbb-tree-caret");

    expect(carets[carets.length - 1]?.dataset["leaf"]).toBe("true");
  });
});

describe("Tree — Enter abre, Space só seleciona", () => {
  it("percorrer com as setas não dispara ativação", () => {
    const onActivate = vi.fn();
    const onSelect = vi.fn();
    render(<Tree nodes={NODES} onSelect={onSelect} onActivate={onActivate} />);

    const first = screen.getAllByRole("button")[0] as HTMLElement;
    fireEvent.keyDown(first, { key: "ArrowDown" });
    fireEvent.keyDown(first, { key: "ArrowUp" });

    expect(onActivate).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("Space seleciona; Enter seleciona e ativa", () => {
    const onActivate = vi.fn();
    const onSelect = vi.fn();
    render(<Tree nodes={NODES} onSelect={onSelect} onActivate={onActivate} />);
    const first = screen.getAllByRole("button")[0] as HTMLElement;

    fireEvent.keyDown(first, { key: " " });
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onActivate).not.toHaveBeenCalled();

    fireEvent.keyDown(first, { key: "Enter" });
    expect(onActivate).toHaveBeenCalledWith("cap-1", NODES[0]);
  });
});

describe("Tree — teclado ARIA", () => {
  it("→ expande e depois entra no primeiro filho", () => {
    render(<Tree nodes={NODES} />);
    const first = screen.getAllByRole("button")[0] as HTMLElement;

    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(screen.getByText("Seção 1.1")).toBeTruthy();

    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(document.activeElement?.textContent).toContain("Seção 1.1");
  });

  it("← colapsa e, na folha, sobe para o pai", () => {
    render(<Tree nodes={NODES} defaultExpanded={["cap-1"]} />);
    const child = screen.getByText("Seção 1.2").closest("button") as HTMLElement;

    fireEvent.keyDown(child, { key: "ArrowLeft" });
    expect(document.activeElement?.textContent).toContain("Capítulo 1");

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowLeft" });
    expect(screen.queryByText("Seção 1.2")).toBeNull();
  });

  it("mantém exatamente uma linha na ordem de tabulação", () => {
    render(<Tree nodes={NODES} defaultExpanded={["cap-1"]} selected="sec-2" />);
    const tabbable = screen.getAllByRole("button").filter((b) => b.tabIndex === 0);

    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]?.textContent).toContain("Seção 1.2");
  });

  it("expõe aria-expanded só em quem tem filhos", () => {
    render(<Tree nodes={NODES} defaultExpanded={["cap-1"]} />);

    expect(itemOf("cap-1").getAttribute("aria-expanded")).toBe("true");
    expect(itemOf("sec-1").hasAttribute("aria-expanded")).toBe(false);
  });
});

describe("Tree — o selecionado aparece", () => {
  it("abre o caminho até o nó selecionado, mesmo com o ramo fechado", () => {
    // O caso que motiva: criar uma questão dentro de um grupo recém-criado. O grupo não estava
    // nos expandidos — ele acabou de nascer —, e a questão nascia selecionada e **invisível**:
    // o editor abria com ela, o cabeçalho a nomeava, e a árvore não mostrava linha nenhuma.
    render(<Tree nodes={NODES} selected="sec-2" />);

    expect(screen.getByText("Seção 1.2")).toBeTruthy();
    expect(itemOf("cap-1").getAttribute("aria-expanded")).toBe("true");
  });

  it("**não** grava essa abertura", () => {
    // Fosse gravada, a árvore voltaria aberta amanhã por causa de um nó que a pessoa nem lembra
    // de ter visitado. O que fica guardado é o que ela abriu com o gesto dela.
    const onExpandedChange = vi.fn();
    render(<Tree nodes={NODES} selected="sec-2" storageKey="lbb:tree:teste" onExpandedChange={onExpandedChange} />);

    expect(onExpandedChange).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("lbb:tree:teste")).toBeNull();
  });

  it("fechar o ramo aberto pela seleção **fecha**, não reabre", () => {
    render(<Tree nodes={NODES} selected="sec-2" />);

    // O caret do capítulo. Aberto por causa da seleção; clicar nele é o gesto de fechar, e o
    // resultado precisa ser fechado — senão o clique parece não fazer nada.
    const caret = itemOf("cap-1").querySelector("[data-open]") as HTMLElement;
    fireEvent.click(caret);

    expect(itemOf("cap-1").getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Seção 1.2")).toBeNull();
  });

  it("nó de raiz selecionado não muda nada", () => {
    render(<Tree nodes={NODES} selected="cap-2" />);
    expect(itemOf("cap-1").getAttribute("aria-expanded")).toBe("false");
  });
});

describe("Tree — persistência", () => {
  it("grava expandidos e selecionado sob a chave informada", () => {
    render(<Tree nodes={NODES} storageKey="lbb:tree:teste" />);

    fireEvent.click(screen.getByText("Capítulo 2 — Limites"));

    const raw = window.localStorage.getItem("lbb:tree:teste");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw ?? "{}")).toMatchObject({ selected: "cap-2" });
  });

  it("restaura os expandidos de uma sessão anterior", () => {
    window.localStorage.setItem("lbb:tree:teste", JSON.stringify({ expanded: ["cap-1"] }));
    render(<Tree nodes={NODES} storageKey="lbb:tree:teste" />);

    expect(screen.getByText("Seção 1.1")).toBeTruthy();
  });

  it("localStorage corrompido não derruba a sidebar", () => {
    window.localStorage.setItem("lbb:tree:teste", "{ isto não é json");
    expect(() => render(<Tree nodes={NODES} storageKey="lbb:tree:teste" />)).not.toThrow();
  });
});

describe("Tree — SSR", () => {
  it("renderiza no servidor sem tocar em localStorage", () => {
    const markup = renderToStaticMarkup(<Tree nodes={NODES} aria-label="Publicação" />);

    expect(markup).toContain('role="tree"');
    expect(markup).toContain("Capítulo 2 — Limites");
  });
});

describe("Tree — gestos de edição", () => {
  const commandsFrom = (key: string, init: Partial<KeyboardEvent> = {}) => {
    // Cada chamada é um render novo: sem limpar, `getAllByRole` pegaria a linha do render
    // anterior e o spy nunca veria a tecla.
    cleanup();
    const onCommand = vi.fn<(c: TreeCommand) => void>();
    render(<Tree nodes={NODES} onCommand={onCommand} />);
    fireEvent.keyDown(screen.getAllByRole("button")[0] as HTMLElement, { key, ...init });
    return onCommand;
  };

  it("F2 pede renomear, Del pede excluir", () => {
    expect(commandsFrom("F2")).toHaveBeenCalledWith({ kind: "rename", nodeId: "cap-1" });
    expect(commandsFrom("Delete")).toHaveBeenCalledWith({ kind: "delete", nodeId: "cap-1" });
  });

  it("Ctrl+N pede irmão; Ctrl+Shift+N pede filho", () => {
    expect(commandsFrom("n", { ctrlKey: true })).toHaveBeenCalledWith({
      kind: "createSibling",
      nodeId: "cap-1",
    });
    expect(commandsFrom("N", { ctrlKey: true, shiftKey: true })).toHaveBeenCalledWith({
      kind: "createChild",
      nodeId: "cap-1",
    });
  });

  it("N sem modificador não é comando — é alguém digitando", () => {
    expect(commandsFrom("n")).not.toHaveBeenCalled();
  });

  it("Alt+↑/↓ movem; as setas sozinhas só andam o foco", () => {
    expect(commandsFrom("ArrowDown", { altKey: true })).toHaveBeenCalledWith({
      kind: "moveDown",
      nodeId: "cap-1",
    });
    expect(commandsFrom("ArrowDown")).not.toHaveBeenCalled();
  });
});

describe("Tree — renomeação inline", () => {
  it("abre com o nome antigo inteiro marcado — o gesto comum é substituir", () => {
    render(<Tree nodes={NODES} editingId="cap-1" />);
    const field = screen.getByRole("textbox", { name: "Novo nome" }) as HTMLInputElement;

    expect(field.value).toBe("Capítulo 1 — Funções");
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(field.value.length);
  });

  it("Enter aplica; Escape cancela sem aplicar", () => {
    const onEditCommit = vi.fn();
    const onEditCancel = vi.fn();
    const { rerender } = render(
      <Tree
        nodes={NODES}
        editingId="cap-1"
        onEditCommit={onEditCommit}
        onEditCancel={onEditCancel}
      />,
    );

    const field = screen.getByRole("textbox", { name: "Novo nome" });
    fireEvent.change(field, { target: { value: "  Funções  " } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onEditCommit).toHaveBeenCalledWith("cap-1", "Funções");

    rerender(
      <Tree
        nodes={NODES}
        editingId="cap-2"
        onEditCommit={onEditCommit}
        onEditCancel={onEditCancel}
      />,
    );
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Novo nome" }), { key: "Escape" });
    expect(onEditCancel).toHaveBeenCalledOnce();
  });

  it("sair do campo aplica — clicar fora não pode perder o que foi digitado", () => {
    const onEditCommit = vi.fn();
    render(<Tree nodes={NODES} editingId="cap-1" onEditCommit={onEditCommit} />);

    const field = screen.getByRole("textbox", { name: "Novo nome" });
    fireEvent.change(field, { target: { value: "Outro nome" } });
    fireEvent.blur(field);

    expect(onEditCommit).toHaveBeenCalledWith("cap-1", "Outro nome");
  });

  it("teclas dentro do campo não viram comando da árvore", () => {
    const onCommand = vi.fn();
    render(<Tree nodes={NODES} editingId="cap-1" onCommand={onCommand} />);

    const field = screen.getByRole("textbox", { name: "Novo nome" });
    fireEvent.keyDown(field, { key: "Delete" });
    fireEvent.keyDown(field, { key: "n", ctrlKey: true });

    expect(onCommand).not.toHaveBeenCalled();
  });
});

describe("Tree — wrapItem", () => {
  it("permite envolver cada linha sem a árvore conhecer menus", () => {
    render(
      <Tree
        nodes={NODES}
        wrapItem={(node, row) => (
          <ContextMenu groups={[[{ id: "del", label: `Excluir ${node.id}`, tone: "danger" }]]}>
            {row}
          </ContextMenu>
        )}
      />,
    );

    fireEvent.contextMenu(screen.getByText("Capítulo 1 — Funções"));
    expect(screen.getByRole("menuitem", { name: "Excluir cap-1" })).toBeTruthy();
  });
});

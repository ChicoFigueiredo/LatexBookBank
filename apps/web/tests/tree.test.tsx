// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Tree, type TreeNode } from "@/design-system";

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

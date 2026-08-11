// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  Banner,
  Breadcrumb,
  BrandMark,
  Combobox,
  Modal,
  PageHeader,
  Segmented,
  Tabs,
  Toast,
} from "@/design-system";

/**
 * Estes são os primeiros componentes do DS com estado, e o que se perde ao reescrevê-los não é
 * aparência: é o teclado, o foco e o papel ARIA. Cada teste aqui afirma um comportamento que
 * some em silêncio — a busca que ignora acento, o Tab que escapa do modal, a aba que rouba a
 * ordem de tabulação.
 */

// Sem `globals: true` no Vitest, o cleanup automático do Testing Library não se registra — e
// dois renders acumulados no mesmo document fazem `getByRole` achar dois comboboxes.
afterEach(cleanup);

const OPTIONS = [
  { value: "mat", label: "Matemática", hint: "312" },
  { value: "fis", label: "Física", hint: "87" },
  { value: "qui", label: "Química", hint: "41" },
];

describe("Combobox", () => {
  it("encontra 'Matemática' sem que o usuário digite o acento", () => {
    render(<Combobox options={OPTIONS} aria-label="Disciplina" />);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "matematica" } });

    expect(screen.getByRole("option", { name: /Matemática/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /Física/ })).toBeNull();
  });

  it("aplica a opção ativa com ↓ e Enter", () => {
    const onChange = vi.fn();
    render(<Combobox options={OPTIONS} onChange={onChange} aria-label="Disciplina" />);
    const input = screen.getByRole("combobox");

    fireEvent.keyDown(input, { key: "ArrowDown" }); // abre, ativa o primeiro
    fireEvent.keyDown(input, { key: "ArrowDown" }); // move para o segundo
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("fis", OPTIONS[1]);
  });

  it("anuncia a opção ativa por aria-activedescendant, sem mover o foco do input", () => {
    render(<Combobox options={OPTIONS} aria-label="Disciplina" />);
    const input = screen.getByRole("combobox");

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });

    const described = input.getAttribute("aria-activedescendant");
    expect(described).toBeTruthy();
    expect(document.getElementById(described ?? "")).toBeTruthy();
  });

  it("não quebra quando a busca encolhe a lista abaixo do índice ativo", () => {
    render(<Combobox options={OPTIONS} aria-label="Disciplina" />);
    const input = screen.getByRole("combobox");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" }); // ativo = último
    fireEvent.change(input, { target: { value: "quimica" } }); // sobra 1

    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option", { name: /Química/ }).dataset["active"]).toBe("true");
  });
});

describe("Modal", () => {
  it("não renderiza nada quando fechado", () => {
    const { container } = render(
      <Modal open={false} title="Excluir nó">
        corpo
      </Modal>,
    );
    expect(container.innerHTML).toBe("");
  });

  it("é um dialog modal rotulado pelo próprio título", () => {
    render(
      <Modal open title="Excluir nó">
        corpo
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");

    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(document.getElementById(labelledBy ?? "")?.textContent).toBe("Excluir nó");
  });

  it("fecha no Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Excluir nó">
        corpo
      </Modal>,
    );

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("permite desligar o fechamento por clique no scrim — decisões em revisão não se descartam sem querer", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal open onClose={onClose} closeOnScrim={false} title="Aplicar patch do agente">
        corpo
      </Modal>,
    );

    fireEvent.mouseDown(container.querySelector(".lbb-scrim") as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("Tabs", () => {
  const TABS = [
    { id: "pdf", label: "PDF" },
    { id: "png", label: "PNG" },
    { id: "log", label: "Log", count: 3 },
  ];

  it("mantém apenas a aba selecionada na ordem de tabulação", () => {
    render(<Tabs tabs={TABS} value="png" aria-label="Artefatos" />);
    const tabs = screen.getAllByRole("tab");

    expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
  });

  it("move com as setas e vai aos extremos com Home/End", () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} value="png" onChange={onChange} aria-label="Artefatos" />);
    const list = screen.getByRole("tablist");

    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("log");

    fireEvent.keyDown(list, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("pdf");
  });
});

describe("Breadcrumb", () => {
  it("marca o último item como página atual e não o transforma em link", () => {
    render(
      <Breadcrumb
        items={[
          { label: "Biblioteca", href: "/" },
          { label: "Álgebra", href: "/pub/1" },
          { label: "Questão 42", href: "/q/42" },
        ]}
      />,
    );

    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByText("Questão 42").getAttribute("aria-current")).toBe("page");
  });
});

describe("Banner e Toast", () => {
  it("erro interrompe (role=alert); aviso comum espera a pausa (role=status)", () => {
    const { rerender } = render(<Banner tone="danger">Worker de render fora do ar</Banner>);
    expect(screen.getByRole("alert")).toBeTruthy();

    rerender(<Banner tone="info">Importação concluída</Banner>);
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("o botão de dispensar tem rótulo acessível", () => {
    render(<Toast title="Questão salva" onDismiss={() => {}} />);
    expect(screen.getByRole("button", { name: "Dispensar" })).toBeTruthy();
  });
});

describe("Segmented", () => {
  it("promove o rótulo a aria-label quando o botão é só ícone", () => {
    render(
      <Segmented
        options={[
          { id: "light", label: "Claro", icon: "sun" },
          { id: "dark", label: "Escuro", icon: "moon", showLabel: true },
        ]}
        value="light"
        aria-label="Tema"
      />,
    );

    expect(screen.getByRole("button", { name: "Claro" }).getAttribute("aria-label")).toBe("Claro");
    expect(screen.getByRole("button", { name: "Escuro" }).getAttribute("aria-label")).toBeNull();
  });
});

describe("BrandMark", () => {
  it("é uma imagem rotulada, não um bloco decorativo", () => {
    render(<BrandMark />);
    expect(screen.getByRole("img", { name: "LatexBookBank" })).toBeTruthy();
  });
});

describe("SSR", () => {
  it("nenhum componente novo quebra sob renderização de servidor", () => {
    const markup = renderToStaticMarkup(
      <>
        <Combobox options={OPTIONS} aria-label="Disciplina" />
        <Banner tone="warn" title="TeX ausente">
          Fallback opcional
        </Banner>
        <Toast title="Render em fila" />
        <Tabs tabs={[{ id: "a", label: "A" }]} value="a" />
        <Segmented options={[{ id: "a", label: "A" }]} value="a" />
        <Breadcrumb items={[{ label: "Biblioteca" }]} />
        <PageHeader eyebrow="QUESTÃO 42" title="Função quadrática" />
        <BrandMark />
        <Modal open title="Diálogo">
          corpo
        </Modal>
      </>,
    );

    expect(markup).toContain("Função quadrática");
    expect(markup).toContain('role="dialog"');
  });
});

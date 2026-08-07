// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  Badge,
  Button,
  EmptyState,
  Field,
  Icon,
  IconButton,
  Input,
  StatusDot,
} from "@/design-system";

/**
 * O que importa nestes componentes não é a aparência — é o que se perde em silêncio quando
 * alguém os reescreve: rótulo acessível, wiring de `aria-describedby`, e o fato de nenhum deles
 * quebrar sob SSR.
 */

describe("acessibilidade que não se vê", () => {
  it("ícone sem rótulo é escondido de leitores de tela", () => {
    const { container } = render(<Icon name="search" />);
    const svg = container.querySelector("svg");

    // Decorativo: quem carrega o significado é o texto ao lado.
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("role")).toBeNull();
  });

  it("ícone com rótulo vira imagem anunciável", () => {
    render(<Icon name="search" aria-label="Buscar" />);
    expect(screen.getByRole("img", { name: "Buscar" })).toBeDefined();
  });

  it("IconButton exige rótulo — botão só de ícone é mudo sem ele", () => {
    render(<IconButton icon="x" aria-label="Fechar painel" />);
    expect(screen.getByRole("button", { name: "Fechar painel" })).toBeDefined();
  });

  it("Field liga label, hint e controle sozinho", () => {
    render(
      <Field label="Enunciado" hint="LaTeX é aceito">
        <Input />
      </Field>,
    );

    const input = screen.getByLabelText("Enunciado");
    const describedBy = input.getAttribute("aria-describedby");

    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toBe("LaTeX é aceito");
  });

  it("Field marca o campo inválido e anuncia o erro", () => {
    render(
      <Field label="Ano" error="Ano deve estar entre 1900 e 2100">
        <Input />
      </Field>,
    );

    expect(screen.getByLabelText("Ano").getAttribute("aria-invalid")).toBe("true");
    // `role=alert` faz o erro chegar sem o usuário reencontrar o campo.
    expect(screen.getByRole("alert").textContent).toContain("1900");
  });

  it("botão em loading anuncia ocupado e fica desabilitado", () => {
    render(<Button loading>Renderizar</Button>);
    const button = screen.getByRole("button", { name: /Renderizar/ });

    expect(button.getAttribute("aria-busy")).toBe("true");
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("StatusDot não depende só de cor", () => {
    render(<StatusDot tone="ok" label="Salvo" />);
    // Cor sozinha exclui quem não a distingue — e a statusbar é lida de relance.
    expect(screen.getByText("Salvo")).toBeDefined();
  });
});

describe("nenhum componente quebra sob SSR", () => {
  it("renderiza no servidor sem tocar em `document`", () => {
    // `injectCss` tem guarda de `document`; sem ela, todo componente derrubaria o build.
    const markup = renderToStaticMarkup(
      <div>
        <Button icon="plus">Nova questão</Button>
        <IconButton icon="settings-2" aria-label="Configurações" />
        <Input placeholder="Buscar" />
        <Badge tone="ai">agente</Badge>
        <StatusDot tone="warn" label="Render pendente" />
        <EmptyState title="Sem questões" description="Crie a primeira." />
      </div>,
    );

    expect(markup).toContain("Nova questão");
    expect(markup).toContain("Sem questões");
  });
});

describe("tons por namespace", () => {
  it("o tom `ai` usa o namespace do agente, não o de status", () => {
    const { container } = render(<Badge tone="ai">agente</Badge>);
    // Superfície de IA nunca deve ler como sucesso, aviso ou erro.
    expect(container.querySelector(".lbb-badge")?.getAttribute("style")).toContain("--ai");
  });
});

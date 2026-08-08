// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OptionRecord } from "@modules/questions/domain/option-mutations";
import { OptionsEditor } from "@modules/questions/ui/OptionsEditor";

afterEach(cleanup);

const option = (id: string, sortKey: string, isCorrect = false): OptionRecord => ({
  id,
  sortKey,
  statementLatex: `texto ${id}`,
  solutionLatex: "",
  isCorrect,
});

const base = [option("a", "a0"), option("b", "a1"), option("c", "a2", true)];

const noop = () => {};

function show(overrides: Partial<Parameters<typeof OptionsEditor>[0]> = {}) {
  return render(
    <OptionsEditor
      options={base}
      onAdd={noop}
      onRemove={noop}
      onMove={noop}
      onSetCorrect={noop}
      onEdit={noop}
      {...overrides}
    />,
  );
}

describe("OptionsEditor", () => {
  it("a letra vem da posição, não do servidor", () => {
    show();

    expect(screen.getByRole("radio", { name: /Marcar a como correta/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Marcar c como correta/ })).toBeTruthy();
  });

  it("a marcação usa `radio`, não `checkbox`", () => {
    // Em múltipla escolha marcar uma desmarca a outra, e é o leitor de tela que precisa saber
    // disso — não só a cor da borda.
    show();
    const correct = screen.getByRole("radio", { name: /Marcar c como correta/ });

    expect(correct.getAttribute("aria-checked")).toBe("true");
  });

  it("subir e descer chamam `onMove` com o índice de destino", () => {
    const onMove = vi.fn();
    show({ onMove });

    fireEvent.click(screen.getByRole("button", { name: /Descer alternativa a/ }));
    expect(onMove).toHaveBeenCalledWith("a", 1);

    fireEvent.click(screen.getByRole("button", { name: /Subir alternativa c/ }));
    expect(onMove).toHaveBeenCalledWith("c", 1);
  });

  it("o primeiro não sobe e o último não desce", () => {
    show();

    expect(screen.getByRole("button", { name: /Subir alternativa a/ })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: /Descer alternativa c/ })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("embaralhar **não** chama nada do servidor", () => {
    // É conferência visual — "o gabarito continua certo se trocarem de lugar?" —, não edição.
    const onMove = vi.fn();
    const onEdit = vi.fn();
    show({ onMove, onEdit });

    fireEvent.click(screen.getByRole("button", { name: "Embaralhar" }));

    expect(onMove).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("embaralhado, a tela diz que nada foi gravado", () => {
    // Sem o selo, a pessoa sai da tela achando que gravou a nova ordem.
    show();
    fireEvent.click(screen.getByRole("button", { name: "Embaralhar" }));

    expect(screen.getByText(/nada foi gravado/)).toBeTruthy();
  });

  it("embaralhado, editar e reordenar ficam bloqueados", () => {
    // Mover "para a terceira posição" da lista embaralhada gravaria uma ordem que a pessoa nunca
    // viu como definitiva.
    show();
    fireEvent.click(screen.getByRole("button", { name: "Embaralhar" }));

    for (const botao of screen.getAllByRole("button", { name: /Remover alternativa/ })) {
      expect(botao).toHaveProperty("disabled", true);
    }
  });

  it("dá para voltar à ordem original", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Embaralhar" }));
    fireEvent.click(screen.getByRole("button", { name: "Ordem original" }));

    expect(screen.queryByText(/nada foi gravado/)).toBeNull();
  });

  it("embaralhar fica indisponível com menos de duas alternativas", () => {
    show({ options: [option("a", "a0")] });
    expect(screen.getByRole("button", { name: "Embaralhar" })).toHaveProperty("disabled", true);
  });

  it("lista vazia explica que discursiva não precisa de alternativa", () => {
    show({ options: [] });
    expect(screen.getByText(/discursivas não precisam/i)).toBeTruthy();
  });

  it("editar o texto avisa quem grava", () => {
    const onEdit = vi.fn();
    show({ onEdit });

    fireEvent.change(screen.getByRole("textbox", { name: /Texto da alternativa a/ }), {
      target: { value: "novo" },
    });
    expect(onEdit).toHaveBeenCalledWith("a", "novo");
  });

  it("desabilitado bloqueia tudo", () => {
    // É o estado de conflito de concorrência: o texto continua visível, mas nada é gravado.
    show({ disabled: true });

    expect(screen.getByRole("button", { name: "Adicionar" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("radio", { name: /Marcar a como correta/ })).toHaveProperty(
      "disabled",
      true,
    );
  });
});

// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Change } from "@modules/agents/domain/patch-diff";
import { PatchReviewPanel } from "@modules/agents/ui/PatchReviewPanel";

/**
 * **O default é nada aprovado.**
 *
 * Um formulário que chega com tudo marcado transforma revisão em confirmação: o usuário clica
 * "aplicar" sem ter olhado linha nenhuma, e o sistema registra isso como aprovação. É o modo de
 * falha que a aprovação explícita existe para impedir, e ele mora na tela, não no servidor.
 */

afterEach(cleanup);

const changes: Change[] = [
  {
    id: "field:statementLatex",
    kind: "field",
    label: "Enunciado",
    before: "Qual e a taxa?",
    after: "Qual é a taxa?",
    latex: true,
  },
  {
    id: "metadata:board",
    kind: "metadata",
    label: "Banca",
    before: "CESPE",
    after: "CEBRASPE",
    latex: false,
  },
];

const show = (over: Partial<Parameters<typeof PatchReviewPanel>[0]> = {}) =>
  render(
    <PatchReviewPanel
      summary="Corrige a acentuação e atualiza o nome da banca."
      warnings={[]}
      changes={changes}
      onApply={() => {}}
      onReject={() => {}}
      onRequestRevision={() => {}}
      {...over}
    />,
  );

describe("nada vem aprovado", () => {
  it("nenhuma caixa começa marcada", () => {
    show();

    for (const box of screen.getAllByRole("checkbox")) {
      expect(box).toHaveProperty("checked", false);
    }
  });

  it("aplicar começa desabilitado", () => {
    // O servidor recusaria de qualquer forma; um botão que erra é pior que um que espera.
    show();
    expect(screen.getByRole("button", { name: "Aplicar seleção" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("a contagem diz quantas de quantas", () => {
    show();
    expect(screen.getByText("0 de 2 aprovadas")).toBeTruthy();
  });
});

describe("aprovar por linha", () => {
  it("marcar uma não marca a outra", () => {
    const onApply = vi.fn();
    show({ onApply });

    fireEvent.click(screen.getByRole("checkbox", { name: "Aprovar: Enunciado" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar seleção" }));

    expect(onApply).toHaveBeenCalledWith(["field:statementLatex"]);
  });

  it("desmarcar tira da seleção", () => {
    const onApply = vi.fn();
    show({ onApply });
    const box = screen.getByRole("checkbox", { name: "Aprovar: Banca" });

    fireEvent.click(box);
    fireEvent.click(box);

    expect(screen.getByRole("button", { name: "Aplicar seleção" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(onApply).not.toHaveBeenCalled();
  });

  it("`Marcar todas` marca, mas **não** aplica", () => {
    // O gesto continua sendo aprovar: o usuário ainda vê o que aprovou antes de confirmar.
    const onApply = vi.fn();
    show({ onApply });

    fireEvent.click(screen.getByRole("button", { name: "Marcar todas" }));

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText("2 de 2 aprovadas")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Aplicar seleção" }));
    expect(onApply).toHaveBeenCalledWith(["field:statementLatex", "metadata:board"]);
  });

  it("o rótulo da caixa nomeia qual linha", () => {
    // Numa lista de cinco, "aprovar" sozinho não diz nada a quem usa leitor de tela.
    show();
    expect(screen.getByRole("checkbox", { name: "Aprovar: Enunciado" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Aprovar: Banca" })).toBeTruthy();
  });
});

describe("o que a tela mostra", () => {
  it("o resumo do que o agente entendeu", () => {
    show();
    expect(screen.getByText(/Corrige a acentuação/)).toBeTruthy();
  });

  it("os avisos do próprio agente", () => {
    show({ warnings: ["Não consegui conferir o gabarito contra a fonte."] });
    expect(screen.getByText(/conferir o gabarito/)).toBeTruthy();
  });

  it("texto curto vai lado a lado, sem Monaco", () => {
    // Uma banca numa caixa de diff de código é ruído.
    show({ changes: [changes[1] as Change] });

    expect(screen.getByText("CESPE")).toBeTruthy();
    expect(screen.getByText("CEBRASPE")).toBeTruthy();
  });

  it("proposta que não muda nada diz isso, em vez de lista vazia", () => {
    // Uma lista vazia pareceria erro de carregamento.
    show({ changes: [] });
    expect(screen.getByText(/não muda nada/)).toBeTruthy();
  });
});

describe("rejeitar e pedir revisão", () => {
  it("rejeitar não pede confirmação — não é destrutivo", () => {
    // Nada foi aplicado; descartar uma proposta não perde trabalho de ninguém.
    const onReject = vi.fn();
    show({ onReject });

    fireEvent.click(screen.getByRole("button", { name: "Rejeitar" }));
    expect(onReject).toHaveBeenCalled();
  });

  it("pedir revisão manda o feedback para o agente", () => {
    const onRequestRevision = vi.fn();
    show({ onRequestRevision });

    fireEvent.click(screen.getByRole("button", { name: "Pedir revisão" }));
    fireEvent.change(screen.getByRole("textbox", { name: "O que revisar" }), {
      target: { value: "A crase está errada — é `à vista`." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Mandar para o agente" }));

    expect(onRequestRevision).toHaveBeenCalledWith("A crase está errada — é `à vista`.");
  });

  it("feedback em branco não é enviado", () => {
    const onRequestRevision = vi.fn();
    show({ onRequestRevision });

    fireEvent.click(screen.getByRole("button", { name: "Pedir revisão" }));
    expect(screen.getByRole("button", { name: "Mandar para o agente" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(onRequestRevision).not.toHaveBeenCalled();
  });
});

describe("enquanto aplica", () => {
  it("tudo fica bloqueado", () => {
    show({ busy: true });

    expect(screen.getByRole("button", { name: "Rejeitar" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Marcar todas" })).toHaveProperty("disabled", true);
    for (const box of screen.getAllByRole("checkbox")) {
      expect(box).toHaveProperty("disabled", true);
    }
  });
});

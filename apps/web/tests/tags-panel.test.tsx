// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TagsPanel } from "@modules/questions/ui/TagsPanel";

/**
 * O painel de tags.
 *
 * As regras de normalização são testadas em `tag.test.ts`; o que se afirma aqui é o **gesto**:
 * colar uma lista aplica todas de uma vez, clicar na sugestão reaproveita a grafia que já existe,
 * e a tag já aplicada não é oferecida de novo.
 */

afterEach(cleanup);

const suggestions = [
  { id: "t1", name: "Função Quadrática", usageCount: 42 },
  { id: "t2", name: "Álgebra", usageCount: 7 },
];

const show = (over: Partial<Parameters<typeof TagsPanel>[0]> = {}) => {
  const onApply = vi.fn();
  const onRemove = vi.fn();

  render(
    <TagsPanel
      applied={[]}
      suggestions={suggestions}
      onApply={onApply}
      onRemove={onRemove}
      {...over}
    />,
  );
  return { onApply, onRemove };
};

const field = () => screen.getByRole("textbox") as HTMLInputElement;

describe("marcar", () => {
  it("colar uma lista aplica todas de uma vez", () => {
    // É o gesto real de quem organiza o acervo; uma por vez transformaria um gesto em três.
    const { onApply } = show();

    fireEvent.change(field(), { target: { value: "álgebra, funções, 2º grau" } });
    fireEvent.keyDown(field(), { key: "Enter" });

    expect(onApply).toHaveBeenCalledWith(["álgebra", "funções", "2º grau"]);
  });

  it("repetida na mesma colagem entra uma vez só", () => {
    const { onApply } = show();

    fireEvent.change(field(), { target: { value: "Álgebra, algebra ,  ÁLGEBRA " } });
    fireEvent.keyDown(field(), { key: "Enter" });

    // A **primeira** grafia sobrevive: quem digitou primeiro escolheu a forma.
    expect(onApply).toHaveBeenCalledWith(["Álgebra"]);
  });

  it("campo vazio não chama nada", () => {
    const { onApply } = show();

    fireEvent.change(field(), { target: { value: "  ,  , " } });
    fireEvent.keyDown(field(), { key: "Enter" });

    expect(onApply).not.toHaveBeenCalled();
  });

  it("o campo esvazia depois de aplicar", () => {
    show();

    fireEvent.change(field(), { target: { value: "álgebra" } });
    fireEvent.keyDown(field(), { key: "Enter" });

    expect(field().value).toBe("");
  });
});

describe("as sugestões", () => {
  it("clicar aplica **o nome da sugestão**, não o que está digitado", () => {
    // É o gesto de reaproveitar a grafia existente — a razão de o autocomplete existir.
    const { onApply } = show();

    fireEvent.change(field(), { target: { value: "funcao quadr" } });
    fireEvent.click(screen.getByText(/Função Quadrática/));

    expect(onApply).toHaveBeenCalledWith(["Função Quadrática"]);
  });

  it("mostram a contagem de uso, que é o critério de ordem", () => {
    show();
    expect(screen.getByText("42")).toBeTruthy();
  });

  it("a já aplicada não é oferecida de novo", () => {
    // Oferecê-la seria oferecer um clique que não faz nada, e quem clica conclui que travou.
    show({ applied: [{ id: "t1", name: "Função Quadrática" }] });

    // Pela contagem, que só a sugestão mostra: o nome sozinho também casa com o botão de remover
    // da tag aplicada, e a asserção passaria pelo motivo errado.
    expect(screen.queryByText("42")).toBeNull();
    expect(screen.getByText("7")).toBeTruthy();
  });

  it("a digitação sobe para quem sabe buscar", () => {
    const onQueryChange = vi.fn();
    show({ onQueryChange });

    fireEvent.change(field(), { target: { value: "fun" } });

    expect(onQueryChange).toHaveBeenCalledWith("fun");
  });
});

describe("desmarcar", () => {
  it("cada tag tem remoção com rótulo próprio", () => {
    // "Remover" sozinho não diz o quê, e numa lista de tags há vários.
    const { onRemove } = show({
      applied: [
        { id: "t1", name: "Álgebra" },
        { id: "t2", name: "Geometria" },
      ],
    });

    fireEvent.click(screen.getByLabelText("Remover Geometria"));

    expect(onRemove).toHaveBeenCalledWith("t2");
  });

  it("sem tags, diz isso em vez de mostrar nada", () => {
    show();
    expect(screen.getByText("Nenhuma tag ainda.")).toBeTruthy();
  });
});

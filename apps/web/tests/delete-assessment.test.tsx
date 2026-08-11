// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeleteAssessment } from "../app/avaliacoes/delete-assessment";

/**
 * O `useRouter` do App Router só existe dentro do provider que o Next monta em runtime, e este
 * componente o usa por um motivo só: pedir `refresh()` depois de apagar, porque a lista é um
 * Server Component. Dublar o hook é mais honesto que montar meio framework para testar um modal.
 */
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

/**
 * Apagar uma prova, e o gabarito que pode ir junto.
 *
 * O produto tinha o gesto de criar e não o de apagar, então toda avaliação montada ficava na lista
 * para sempre. Acrescentar o botão é fácil; o que este arquivo protege é a **segunda pergunta**:
 * quando há variante sorteada, o mapa de letras dela *é* o gabarito de uma prova que pode já ter
 * sido impressa, e a seed sozinha não reconstrói — ela reproduz o embaralhamento apenas enquanto a
 * questão tiver exatamente as mesmas alternativas (§17).
 *
 * Perguntar as duas coisas do mesmo jeito ensinaria a clicar em "sim" sem ler, que é como se perde
 * um gabarito.
 *
 * Ver issue #171 · spec §20.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const show = () => render(<DeleteAssessment assessmentId="a1" title="Prova do 1º bimestre" />);

const abrir = () => fireEvent.click(screen.getByRole("button", { name: /Apagar Prova do 1º/ }));

/** `fetch` que responde o que o teste mandar, guardando as URLs pedidas. */
function stubFetch(...responses: { status: number; body?: unknown }[]) {
  const calls: string[] = [];
  let i = 0;

  vi.stubGlobal("fetch", (url: string) => {
    calls.push(String(url));
    const response = responses[Math.min(i++, responses.length - 1)] ?? { status: 200 };

    return Promise.resolve({
      ok: response.status < 400,
      status: response.status,
      json: () => Promise.resolve(response.body ?? {}),
    } as Response);
  });

  return calls;
}

describe("apagar uma avaliação sem variante", () => {
  it("pede confirmação — e clicar fora não descarta a prova", () => {
    show();
    abrir();

    expect(screen.getByText("Apagar avaliação?")).toBeTruthy();
    // O texto diz o que **não** acontece: quem monta precisa saber que o acervo continua inteiro.
    expect(screen.getByText(/questões continuam no acervo/)).toBeTruthy();
  });

  it("apaga sem `confirmVariants` — não há gabarito em jogo", async () => {
    const calls = stubFetch({ status: 200, body: { deleted: true } });

    show();
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Apagar" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toBe("/api/assessments/a1");
    expect(calls[0]).not.toContain("confirmVariants");
  });
});

describe("apagar uma avaliação **com** variante sorteada", () => {
  it("o 409 vira a segunda pergunta, com as letras e o que se perde", async () => {
    stubFetch({
      status: 409,
      body: { variantLabels: ["A", "B"], message: "…" },
    });

    show();
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Apagar" }));

    // O título muda: não é mais "apagar avaliação", é "isto apaga o gabarito".
    await waitFor(() => expect(screen.getByText("Isto apaga o gabarito")).toBeTruthy());
    expect(screen.getByText(/2 variante\(s\) sorteada\(s\)/)).toBeTruthy();
    expect(screen.getByText(/\(A, B\)/)).toBeTruthy();
    expect(screen.getByText(/a seed\s+sozinha não reconstrói/)).toBeTruthy();
  });

  it("o segundo clique manda `confirmVariants=1` — e é o único que manda", async () => {
    const calls = stubFetch(
      { status: 409, body: { variantLabels: ["A"] } },
      { status: 200, body: { deleted: true } },
    );

    show();
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Apagar" }));

    await waitFor(() => expect(screen.getByText("Isto apaga o gabarito")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Apagar mesmo assim" }));

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0]).not.toContain("confirmVariants");
    expect(calls[1]).toContain("confirmVariants=1");
  });

  it("cancelar depois do aviso volta ao começo — a próxima abertura pergunta de novo", async () => {
    // Sem isto, quem cancelou uma vez encontraria o modal já em "apagar mesmo assim" na próxima
    // abertura, e um clique distraído levaria o gabarito.
    stubFetch({ status: 409, body: { variantLabels: ["A"] } });

    show();
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Apagar" }));

    await waitFor(() => expect(screen.getByText("Isto apaga o gabarito")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    abrir();
    expect(screen.getByText("Apagar avaliação?")).toBeTruthy();
  });

  it("falha do servidor aparece, e a prova **não** some da tela", async () => {
    stubFetch({ status: 500, body: { message: "banco fora do ar" } });

    show();
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Apagar" }));

    await waitFor(() => expect(screen.getByText("banco fora do ar")).toBeTruthy());
    expect(screen.getByText("Apagar avaliação?")).toBeTruthy();
  });
});

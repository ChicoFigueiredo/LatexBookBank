// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OptionsPane } from "../app/publications/[id]/options-pane";

/**
 * A ligação entre o editor de alternativas e as rotas.
 *
 * O `OptionsEditor` já é testado sozinho, e as rotas também. O que ninguém testava é o meio: se o
 * painel chama a rota certa com o corpo certo, e se a lista **volta do servidor** depois de cada
 * mutação. Foi exatamente esse meio que faltou por completo até agora — componente pronto, rota
 * pronta, e nada ligando os dois.
 */

afterEach(cleanup);

const OPTIONS = [
  { id: "o1", sortKey: "a0", statementLatex: "primeira", solutionLatex: "", isCorrect: false },
  { id: "o2", sortKey: "a1", statementLatex: "segunda", solutionLatex: "", isCorrect: true },
];

let calls: Array<{ url: string; method: string; body: unknown }>;

const stub = (options = OPTIONS, failMutation = false) => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({
        url,
        method,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      });

      if (method === "GET") {
        return new Response(JSON.stringify({ options }), {
          headers: { "content-type": "application/json" },
        });
      }
      if (failMutation) {
        return new Response(JSON.stringify({ message: "o servidor recusou" }), { status: 409 });
      }
      return new Response(JSON.stringify({ ok: true }));
    }),
  );
};

const base = "/api/publications/pub-1/questions/q-1/options";

const show = () => render(<OptionsPane publicationId="pub-1" questionId="q-1" />);

const gets = () => calls.filter((call) => call.method === "GET");

describe("carregar", () => {
  it("pede as alternativas com id e ordem — o DTO da árvore não tem isso", async () => {
    stub();
    show();

    await waitFor(() => screen.getByDisplayValue("primeira"));
    expect(calls[0]?.url).toBe(base);
  });
});

describe("as mutações vão para a rota certa", () => {
  it("adicionar é `POST` na coleção", async () => {
    stub();
    show();
    await waitFor(() => screen.getByDisplayValue("primeira"));

    fireEvent.click(screen.getByText(/adicionar/i));

    await waitFor(() => expect(calls.some((call) => call.method === "POST")).toBe(true));
    expect(calls.find((call) => call.method === "POST")?.url).toBe(base);
  });

  it("marcar correta manda `isCorrect: true` — nunca `false`", async () => {
    // Não existe "desmarcar" na API de propósito: ficar sem gabarito é resultado de remover ou de
    // marcar outra, nunca um pedido que a interface precise oferecer.
    stub();
    show();
    await waitFor(() => screen.getByDisplayValue("primeira"));

    fireEvent.click(screen.getAllByRole("radio")[0]!);

    await waitFor(() => expect(calls.some((call) => call.method === "PATCH")).toBe(true));
    const patch = calls.find((call) => call.method === "PATCH")!;
    expect(patch.url).toBe(`${base}/o1`);
    expect(patch.body).toEqual({ isCorrect: true });
  });

  it("remover é `DELETE` no item, com o id na URL", async () => {
    stub();
    show();
    await waitFor(() => screen.getByDisplayValue("primeira"));

    fireEvent.click(screen.getAllByRole("button", { name: /remover/i })[0]!);

    await waitFor(() => expect(calls.some((call) => call.method === "DELETE")).toBe(true));
    expect(calls.find((call) => call.method === "DELETE")?.url).toBe(`${base}/o1`);
  });
});

describe("depois de mudar, a lista volta do servidor", () => {
  it("cada mutação bem-sucedida provoca uma releitura", async () => {
    // Marcar uma correta desmarca a outra **no servidor**. Reproduzir essa regra no cliente seria
    // tê-la em dois lugares, e um deles ficaria para trás.
    stub();
    show();
    await waitFor(() => screen.getByDisplayValue("primeira"));
    expect(gets()).toHaveLength(1);

    fireEvent.click(screen.getAllByRole("radio")[0]!);

    await waitFor(() => expect(gets()).toHaveLength(2));
  });

  it("mutação recusada mostra o motivo e **não** relê", async () => {
    stub(OPTIONS, true);
    show();
    await waitFor(() => screen.getByDisplayValue("primeira"));

    fireEvent.click(screen.getAllByRole("radio")[0]!);

    await waitFor(() => screen.getByText("o servidor recusou"));
    expect(gets()).toHaveLength(1);
  });
});

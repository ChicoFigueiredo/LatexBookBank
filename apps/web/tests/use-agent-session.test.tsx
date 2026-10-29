// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ContextItem } from "@modules/agents/domain/agent-context";
import { useAgentSession } from "@modules/agents/ui/use-agent-session";

/**
 * A sessão do agente fora da tela (tarefa I8 · ARQ-08 da revisão de 2026-09-23).
 *
 * Era um bloco de ~200 linhas do workbench da publicação, e só o E2E o exercitava. O `fetch` aqui
 * é dublê de propósito: o que se afirma é o comportamento da sessão — o que entra na conversa,
 * quando, e o que a tela diz em cada falha. O contrato com as rotas reais está em
 * `agent-client-contract.test.ts`.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) => Promise.resolve(Response.json(body, { status }));

const change = (id: string) => ({
  id,
  kind: "field",
  label: "Complemento",
  before: "",
  after: "x",
});

const proposal = (summary: string, changes: unknown[]) => ({
  patch: { schemaVersion: 1, summary, warnings: [], fields: [], options: [] },
  summary,
  warnings: [],
  changes,
});

const answer = (over: Record<string, unknown> = {}) => ({
  answer: "Resposta.",
  proposals: [],
  state: "DONE",
  toolCalls: [],
  usage: { inputTokens: 3, outputTokens: 4 },
  durationMs: 10,
  error: null,
  runId: null,
  ...over,
});

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const fake = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init),
  );
  vi.stubGlobal("fetch", fake);
  return fake;
}

const bodyOf = (init?: RequestInit) => JSON.parse(String(init?.body)) as Record<string, unknown>;

describe("a conversa", () => {
  it("a pergunta entra antes da resposta, e a resposta chega com tools e uso", async () => {
    let release: (value: Response) => void = () => {};
    const fetch = stubFetch(() => new Promise((resolve) => (release = resolve)));
    const { result } = renderHook(() => useAgentSession({ questionId: "q-1" }));

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.ask("o que há de errado?");
    });

    expect(result.current.turns.map((turn) => turn.text)).toEqual(["o que há de errado?"]);
    expect(result.current.busy).toBe(true);

    await act(async () => {
      release(Response.json(answer()));
      await pending;
    });

    expect(result.current.busy).toBe(false);
    expect(result.current.turns.map((turn) => [turn.role, turn.text])).toEqual([
      ["user", "o que há de errado?"],
      ["assistant", "Resposta."],
    ]);
    expect(result.current.turns[1]?.usage).toEqual({ inputTokens: 3, outputTokens: 4 });

    expect(fetch).toHaveBeenCalledWith("/api/agents/ask", expect.anything());
    expect(bodyOf(fetch.mock.calls[0]?.[1])).toEqual({
      prompt: "o que há de errado?",
      mode: "ASK",
      questionId: "q-1",
      context: [],
    });
  });

  it("manda o modo e o contexto escolhidos", async () => {
    const fetch = stubFetch(() => json(answer()));
    const { result } = renderHook(() => useAgentSession({ questionId: null }));
    const item: ContextItem = {
      id: "sel",
      kind: "selection",
      label: "Trecho",
      content: "x^2",
      explicit: true,
    };

    act(() => {
      result.current.setMode("REVIEW");
      result.current.attach(item);
    });
    await act(() => result.current.ask("revise"));

    expect(bodyOf(fetch.mock.calls[0]?.[1])).toMatchObject({
      mode: "REVIEW",
      questionId: null,
      context: [item],
    });
  });

  it("a recusa da rota aparece com a mensagem dela, e a pergunta fica na tela", async () => {
    stubFetch(() => json({ error: "ai_not_configured", message: "Defina AI_BASE_URL." }, 503));
    const { result } = renderHook(() => useAgentSession({ questionId: null }));

    await act(() => result.current.ask("oi"));

    expect(result.current.error).toBe("Defina AI_BASE_URL.");
    expect(result.current.turns.map((turn) => turn.text)).toEqual(["oi"]);
  });

  it("recusa sem mensagem cai no texto padrão; rede fora ou corpo que não é JSON, no outro", async () => {
    stubFetch(() => json({}, 500));
    const semMensagem = renderHook(() => useAgentSession({ questionId: null }));
    await act(() => semMensagem.result.current.ask("oi"));
    expect(semMensagem.result.current.error).toBe("O agente não respondeu.");

    stubFetch(() => Promise.resolve(new Response("<html>500</html>", { status: 500 })));
    const html = renderHook(() => useAgentSession({ questionId: null }));
    await act(() => html.result.current.ask("oi"));
    expect(html.result.current.error).toBe("Não deu para falar com o servidor.");

    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    const rede = renderHook(() => useAgentSession({ questionId: null }));
    await act(() => rede.result.current.ask("oi"));
    expect(rede.result.current.error).toBe("Não deu para falar com o servidor.");
  });
});

describe("a proposta", () => {
  it("vale a primeira que muda alguma coisa; a vazia é pulada", async () => {
    stubFetch(() =>
      json(
        answer({
          proposals: [proposal("nada", []), proposal("muda", [change("field:complementLatex:1")])],
        }),
      ),
    );
    const { result } = renderHook(() => useAgentSession({ questionId: "q-1" }));

    await act(() => result.current.ask("revise"));

    expect(result.current.proposal?.summary).toBe("muda");
  });

  it("aplicar manda só as aprovadas, diz a revisão e as ignoradas, e avisa a tela", async () => {
    const onApplied = vi.fn();
    const fetch = stubFetch((url) =>
      url === "/api/agents/ask"
        ? json(answer({ proposals: [proposal("muda", [change("field:complementLatex:1")])] }))
        : json({ revisionNumber: 7, applied: ["a"], stale: ["b"], summary: "s" }),
    );
    const { result } = renderHook(() => useAgentSession({ questionId: "q-1", onApplied }));

    await act(() => result.current.ask("revise"));
    await act(() => result.current.applyProposal(["field:complementLatex:1"]));

    const [url, init] = fetch.mock.calls[1] ?? [];
    expect(url).toBe("/api/agents/patches/apply");
    expect(bodyOf(init)).toMatchObject({
      questionId: "q-1",
      approvedChangeIds: ["field:complementLatex:1"],
      patch: { summary: "muda" },
    });
    expect(result.current.proposal).toBeNull();
    expect(result.current.turns.at(-1)?.text).toBe(
      "Aplicado. Revisão 7 guarda o estado anterior. 1 mudança(s) já não existiam e foram ignoradas.",
    );
    expect(onApplied).toHaveBeenCalledTimes(1);
  });

  it("a recusa de aplicar mantém a proposta e mostra o motivo", async () => {
    const onApplied = vi.fn();
    stubFetch((url) =>
      url === "/api/agents/ask"
        ? json(answer({ proposals: [proposal("muda", [change("field:complementLatex:1")])] }))
        : json({ error: "nothing_approved", message: "Nada aprovado." }, 400),
    );
    const { result } = renderHook(() => useAgentSession({ questionId: "q-1", onApplied }));

    await act(() => result.current.ask("revise"));
    await act(() => result.current.applyProposal(["x"]));

    expect(result.current.error).toBe("Nada aprovado.");
    expect(result.current.proposal?.summary).toBe("muda");
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("sem questão em foco, aplicar não faz nada", async () => {
    const fetch = stubFetch(() =>
      json(answer({ proposals: [proposal("muda", [change("field:complementLatex:1")])] })),
    );
    const { result } = renderHook(() => useAgentSession({ questionId: null }));

    await act(() => result.current.ask("revise"));
    await act(() => result.current.applyProposal(["x"]));

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("pedir revisão tira a proposta da tela e manda o feedback como pergunta", async () => {
    const fetch = stubFetch(() =>
      json(answer({ proposals: [proposal("muda", [change("field:complementLatex:1")])] })),
    );
    const { result } = renderHook(() => useAgentSession({ questionId: "q-1" }));
    await act(() => result.current.ask("revise"));

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.requestRevision("mais curto");
    });
    expect(result.current.proposal).toBeNull();
    await act(() => pending);

    expect(bodyOf(fetch.mock.calls[1]?.[1])).toMatchObject({ prompt: "mais curto" });
  });
});

describe("a prévia do candidato", () => {
  it("compila o antes e o depois do campo, e a recusa vira diagnóstico", async () => {
    const fetch = stubFetch((_url, init) =>
      bodyOf(init)["value"] === "antes"
        ? json({ success: true, durationMs: 5, diagnostics: [], png: "data:image/png;base64,AA" })
        : json({ error: "renderer_not_configured", message: "Sem worker." }, 503),
    );
    const { result } = renderHook(() => useAgentSession({ questionId: "q-1" }));

    const preview = await result.current.previewChange({
      id: "field:statementLatex:abc",
      before: "antes",
      after: "depois",
    });

    expect(preview.before).toEqual({
      png: "data:image/png;base64,AA",
      success: true,
      diagnostics: [],
    });
    expect(preview.after).toEqual({
      png: null,
      success: false,
      diagnostics: [{ severity: "error", message: "Sem worker." }],
    });
    expect(bodyOf(fetch.mock.calls[0]?.[1])).toMatchObject({
      questionId: "q-1",
      field: "statementLatex",
    });
  });

  it("linha que não é campo de texto é recusada sem ir ao servidor", async () => {
    const fetch = stubFetch(() => json({}));
    const { result } = renderHook(() => useAgentSession({ questionId: "q-1" }));

    await expect(
      result.current.previewChange({ id: "option:o-1:abc", before: "", after: "" }),
    ).rejects.toThrow("Esta linha não é um campo de texto.");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("o contexto", () => {
  it("anexar acima do teto é recusado com a mensagem do domínio, sem perder o que havia", async () => {
    stubFetch(() => json({}));
    const { result } = renderHook(() => useAgentSession({ questionId: null }));
    const item = (id: string, size: number): ContextItem => ({
      id,
      kind: "selection",
      label: id,
      content: "x".repeat(size),
      explicit: true,
    });

    act(() => result.current.attach(item("a", 40_000)));
    act(() => result.current.attach(item("b", 40_000)));

    await waitFor(() => expect(result.current.error).toMatch(/60/));
    expect(result.current.context.items.map((entry) => entry.id)).toEqual(["a"]);

    act(() => result.current.detach("a"));
    expect(result.current.context.items).toEqual([]);
  });
});

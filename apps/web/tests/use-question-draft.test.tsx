// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AUTOSAVE_DELAY_MS,
  RETRY_DELAY_MS,
  useQuestionDraft,
} from "@modules/questions/ui/use-question-draft";
import { agentApi } from "@modules/agents/ui/agent-client";
import { useQuestionHistory } from "@modules/questions/ui/use-question-history";

/**
 * O rascunho e o histórico da questão fora do editor (tarefa I8 · ARQ-08 da revisão de
 * 2026-09-23).
 *
 * O autosave — debounce, versão, conflito que para, falha que insiste — só era exercitado pelo
 * E2E (`autosave-insiste.spec.ts`, `questao.spec.ts`). O `fetch` aqui é dublê: o que se afirma é o
 * comportamento; o contrato com as rotas está em `question-client-contract.test.ts`.
 */

const INITIAL = { statementLatex: "a", solutionLatex: "b", complementLatex: "c" } as const;
const URL_QUESTAO = "/api/publications/p-1/questions/q-1";

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const fake = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init),
  );
  vi.stubGlobal("fetch", fake);
  return fake;
}

const json = (body: unknown, status = 200) => Promise.resolve(Response.json(body, { status }));
const bodyOf = (init?: RequestInit) => JSON.parse(String(init?.body)) as Record<string, unknown>;
const patches = (fetch: ReturnType<typeof stubFetch>) =>
  fetch.mock.calls.filter(([, init]) => init?.method === "PATCH");

function draftHook(onDirtyChange?: (id: string | null) => void) {
  return renderHook(() =>
    useQuestionDraft({
      publicationId: "p-1",
      questionId: "q-1",
      initial: INITIAL,
      initialVersion: "v1",
      onDirtyChange,
    }),
  );
}

/** Avança o relógio e deixa as promessas do `fetch` assentarem. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("o autosave", () => {
  it("digitar marca não salvo, e depois da pausa grava tudo com a versão; a seguinte usa a nova", async () => {
    const fetch = stubFetch(() => json({ id: "q-1", version: "v2", written: true }));
    const onDirtyChange = vi.fn();
    const { result } = draftHook(onDirtyChange);

    act(() => result.current.changeField("solutionLatex", "nova"));
    expect(result.current.state).toBe("dirty");
    expect(result.current.draft.solutionLatex).toBe("nova");
    expect(onDirtyChange).toHaveBeenLastCalledWith("q-1");

    await advance(AUTOSAVE_DELAY_MS - 1);
    expect(patches(fetch)).toHaveLength(0);
    await advance(1);

    expect(result.current.state).toBe("saved");
    expect(onDirtyChange).toHaveBeenLastCalledWith(null);
    const [url, init] = patches(fetch)[0] ?? [];
    expect(url).toBe(URL_QUESTAO);
    expect(bodyOf(init)).toEqual({ expectedVersion: "v1", ...INITIAL, solutionLatex: "nova" });

    await act(() => result.current.save());
    expect(bodyOf(patches(fetch)[1]?.[1])["expectedVersion"]).toBe("v2");
  });

  it("os metadados carregados vão no mesmo PATCH, com a mesma versão", async () => {
    const metadata = {
      difficulty: 5,
      year: null,
      board: null,
      institution: null,
      role: null,
      roleLevel: null,
      publisher: null,
      videoUrl: null,
    };
    const fetch = stubFetch((_url, init) =>
      init?.method === "PATCH"
        ? json({ id: "q-1", version: "v2", written: true })
        : json({ version: "v1", metadata }),
    );
    const { result } = draftHook();

    await act(() => result.current.loadMetadata());
    expect(result.current.metadata).toEqual(metadata);

    act(() => result.current.changeMetadata({ board: "FGV" }));
    expect(result.current.state).toBe("dirty");
    await advance(AUTOSAVE_DELAY_MS);

    expect(bodyOf(patches(fetch)[0]?.[1])).toEqual({
      expectedVersion: "v1",
      ...INITIAL,
      ...metadata,
      board: "FGV",
    });
  });

  it("conflito para e bloqueia, com a mensagem da rota; digitar não desfaz o conflito", async () => {
    stubFetch(() => json({ error: "conflict", message: "Mudou antes." }, 409));
    const { result } = draftHook();

    await act(() => result.current.save());
    expect(result.current.state).toBe("conflict");
    expect(result.current.blocked).toBe(true);
    expect(result.current.message).toBe("Mudou antes.");

    act(() => result.current.changeField("statementLatex", "x"));
    expect(result.current.state).toBe("conflict");
  });

  it("conflito sem mensagem diz o padrão", async () => {
    stubFetch(() => Promise.resolve(new Response("", { status: 409 })));
    const { result } = draftHook();

    await act(() => result.current.save());
    expect(result.current.message).toBe("Esta questão mudou desde que você abriu.");
  });

  it("recusa é erro com a mensagem, e o autosave insiste depois de 30 s", async () => {
    let answer = () => json({ error: "invalid_metadata", message: "Ano inválido." }, 400);
    const fetch = stubFetch(() => answer());
    const { result } = draftHook();

    await act(() => result.current.save());
    expect(result.current.state).toBe("error");
    expect(result.current.message).toBe("Ano inválido.");

    answer = () => json({ id: "q-1", version: "v2", written: true });
    await advance(RETRY_DELAY_MS - 1);
    expect(patches(fetch)).toHaveLength(1);
    await advance(1);

    expect(patches(fetch)).toHaveLength(2);
    expect(result.current.state).toBe("saved");
    expect(result.current.message).toBeNull();
  });

  it("recusa sem corpo JSON diz o status; rede fora diz que o texto continua aqui", async () => {
    stubFetch(() => Promise.resolve(new Response("<html/>", { status: 502 })));
    const semCorpo = draftHook();
    await act(() => semCorpo.result.current.save());
    expect(semCorpo.result.current.message).toBe("Falha ao salvar (status 502).");

    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    const rede = draftHook();
    await act(() => rede.result.current.save());
    expect(rede.result.current.state).toBe("error");
    expect(rede.result.current.message).toBe(
      "Não foi possível falar com o servidor. O texto continua aqui.",
    );
  });

  it("desmontar com gravação pendente não grava", async () => {
    const fetch = stubFetch(() => json({ id: "q-1", version: "v2", written: true }));
    const { result, unmount } = draftHook();

    act(() => result.current.changeField("statementLatex", "x"));
    unmount();
    await advance(AUTOSAVE_DELAY_MS * 2);

    expect(patches(fetch)).toHaveLength(0);
  });
});

describe("o histórico", () => {
  const snapshot = {
    type: "DISCURSIVE",
    statementLatex: "antigo",
    solutionLatex: "b",
    complementLatex: "c",
    nickname: null,
    options: [],
    metadata: {},
    tags: ["velha"],
  };

  it("carrega a timeline e faz o diff contra o texto da tela, não o do banco", async () => {
    const fetch = stubFetch((url) =>
      url.endsWith("?revision=3")
        ? json({
            revisionNumber: 3,
            origin: "AGENT",
            summary: "s",
            createdAt: "2026-10-01T00:00:00.000Z",
            snapshot,
            current: { ...snapshot, statementLatex: "do banco", tags: ["nova"] },
          })
        : json({
            revisions: [
              { revisionNumber: 3, origin: "AGENT", summary: "s", createdAt: "2026-10-01" },
            ],
          }),
    );
    const { result } = renderHook(() =>
      useQuestionHistory({
        questionId: "q-1",
        draft: { statementLatex: "na tela", solutionLatex: "b", complementLatex: "c" },
        onRestored: () => {},
        revert: agentApi.revertPatch,
      }),
    );

    expect(result.current.revisions).toBeNull();
    await act(() => result.current.load());
    // Só o caminho: a leitura passa pelo `api-client`, que repassa o `init` (aqui, nenhum).
    expect(fetch.mock.lastCall?.[0]).toBe("/api/questions/q-1/revisions");
    expect(result.current.revisions?.map((row) => row.revisionNumber)).toEqual([3]);

    await act(() => result.current.select(3));
    expect(result.current.selected).toBe(3);
    const changed = result.current.changes?.map((change) => [change.before, change.after] as const);
    expect(changed).toContainEqual(["antigo", "na tela"]);
    expect(changed?.some(([, after]) => after === "do banco")).toBe(false);
    expect(
      changed?.some(([before, after]) => before.includes("velha") && after.includes("nova")),
    ).toBe(true);
  });

  it("revisão sem um dos lados deixa o diff vazio de carregamento", async () => {
    stubFetch(() => json({ error: "revision_not_found", message: "não tem" }, 404));
    const { result } = renderHook(() =>
      useQuestionHistory({
        questionId: "q-1",
        draft: INITIAL,
        onRestored: () => {},
        revert: agentApi.revertPatch,
      }),
    );

    await act(() => result.current.select(9));
    expect(result.current.selected).toBe(9);
    expect(result.current.changes).toBeNull();
  });

  it("restaurar pede a revisão ao servidor e recarrega, com sucesso ou recusa", async () => {
    const fetch = stubFetch(() => json({ error: "question_gone", message: "x" }, 409));
    const onRestored = vi.fn();
    const { result } = renderHook(() =>
      useQuestionHistory({
        questionId: "q-1",
        draft: INITIAL,
        onRestored,
        revert: agentApi.revertPatch,
      }),
    );

    await act(() => result.current.restore(2));

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("/api/agents/patches/revert");
    expect(bodyOf(init)).toEqual({ questionId: "q-1", revisionNumber: 2 });
    expect(onRestored).toHaveBeenCalledTimes(1);
  });
});

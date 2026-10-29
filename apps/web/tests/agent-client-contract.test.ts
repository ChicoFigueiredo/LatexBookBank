import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { seedLibrary } from "./support/assessment-seed";
import { installRouteFetch, type RouteEntry } from "./support/route-fetch";
import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * O cliente do agente contra as rotas de verdade (tarefa I8 · ARQ-10 da revisão de 2026-09-23).
 *
 * O `tsc` liga o tipo da rota ao do cliente pelo `agent-contract.ts`; este teste liga o **resto**:
 * o caminho, o método, o corpo que o cliente monta e o que a rota devolve com um banco real. Só o
 * endpoint de IA é dublê — ele responde no formato compatível com o OpenAI, propondo um patch na
 * primeira chamada e respondendo em texto na segunda.
 */

const ROUTES: readonly RouteEntry[] = [
  ["POST", "/api/agents/ask", () => import("../app/api/agents/ask/route")],
  [
    "POST",
    "/api/agents/candidate-render",
    () => import("../app/api/agents/candidate-render/route"),
  ],
  ["POST", "/api/agents/patches/apply", () => import("../app/api/agents/patches/apply/route")],
  ["POST", "/api/agents/patches/revert", () => import("../app/api/agents/patches/revert/route")],
];

const MARCA = "complemento escrito pelo agente";

/** O endpoint de IA dublado: propõe na primeira volta, responde na segunda. */
function fakeAi() {
  let round = 0;
  return async (request: Request): Promise<Response> => {
    if (!request.url.startsWith("http://ia.test/")) {
      throw new Error(`Rede inesperada no teste: ${request.url}`);
    }
    round += 1;
    const message =
      round === 1
        ? {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call-1",
                type: "function",
                function: {
                  name: "propose_question_patch",
                  arguments: JSON.stringify({
                    summary: "Escreve o complemento",
                    fields: [{ field: "complementLatex", value: MARCA }],
                  }),
                },
              },
            ],
          }
        : { role: "assistant", content: "Proposta feita." };
    return Response.json({
      choices: [{ message, finish_reason: round === 1 ? "tool_calls" : "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
  };
}

let dispose: () => Promise<void>;
let restoreFetch: (() => void) | null = null;
const saved = { ...process.env };

beforeAll(async () => {
  dispose = (await createTempDatabase()).dispose;
});

afterAll(async () => {
  await dispose();
});

afterEach(async () => {
  restoreFetch?.();
  restoreFetch = null;
  for (const key of ["AI_BASE_URL", "AI_MODEL", "AI_TOOL_CALLING", "RENDERER_BASE_URL"]) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  (await import("@/shared/config/env")).resetEnvCache();
});

async function withAi() {
  process.env["AI_BASE_URL"] = "http://ia.test/v1";
  process.env["AI_MODEL"] = "modelo-de-teste";
  process.env["AI_TOOL_CALLING"] = "true";
  (await import("@/shared/config/env")).resetEnvCache();
  restoreFetch = installRouteFetch(ROUTES, fakeAi()).restore;
}

describe("o cliente do agente fala a língua das rotas", () => {
  it("pergunta, recebe a proposta com o diff, aplica a linha aprovada e reverte", async () => {
    const library = await seedLibrary("agente-contrato");
    const { questionId } = await library.question({
      type: "DISCURSIVE",
      statement: "Demonstre que há infinitos primos.",
    });
    await withAi();
    const { agentApi } = await import("@modules/agents/ui/agent-client");

    const answer = await agentApi.ask({
      prompt: "escreva um complemento",
      mode: "REVIEW",
      questionId,
      context: [],
    });

    expect(answer.answer).toBe("Proposta feita.");
    expect(answer.error).toBeNull();
    expect(typeof answer.runId).toBe("string");
    expect(answer.toolCalls.map((call) => call.name)).toContain("propose_question_patch");
    const [proposal] = answer.proposals;
    expect(proposal?.summary).toBe("Escreve o complemento");
    const change = proposal?.changes.find((entry) => entry.label === "Complemento");
    expect(change?.after).toBe(MARCA);

    const applied = await agentApi.applyPatch({
      questionId,
      approvedChangeIds: [change?.id ?? ""],
      patch: proposal!.patch,
    });
    expect(applied.revisionNumber).toBeGreaterThan(0);
    expect(applied.stale).toEqual([]);

    const gravada = await library.prisma.question.findUniqueOrThrow({ where: { id: questionId } });
    expect(gravada.complementLatex).toBe(MARCA);

    await agentApi.revertPatch({ questionId, revisionNumber: applied.revisionNumber });
    const revertida = await library.prisma.question.findUniqueOrThrow({
      where: { id: questionId },
    });
    expect(revertida.complementLatex).toBe("");
  });

  it("a recusa da rota vira ApiError com a mensagem dela", async () => {
    await withAi();
    const { agentApi } = await import("@modules/agents/ui/agent-client");
    const { ApiError } = await import("@/shared/http/api-client");

    const failure = await agentApi
      .ask({ prompt: "   ", mode: "ASK", questionId: null, context: [] })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as InstanceType<typeof ApiError>).status).toBe(400);
    expect((failure as InstanceType<typeof ApiError>).serverMessage).toMatch(/prompt/);
  });

  it("sem IA configurada, a rota diz o que falta e o cliente entrega a mensagem", async () => {
    delete process.env["AI_BASE_URL"];
    (await import("@/shared/config/env")).resetEnvCache();
    restoreFetch = installRouteFetch(ROUTES).restore;
    const { agentApi } = await import("@modules/agents/ui/agent-client");
    const { ApiError } = await import("@/shared/http/api-client");

    const failure = await agentApi
      .ask({ prompt: "oi", mode: "ASK", questionId: null, context: [] })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as InstanceType<typeof ApiError>).status).toBe(503);
    expect((failure as InstanceType<typeof ApiError>).serverMessage).toMatch(/AI_BASE_URL/);
  });

  it("o candidato sem worker volta como corpo de recusa, que a revisão mostra como diagnóstico", async () => {
    delete process.env["RENDERER_BASE_URL"];
    (await import("@/shared/config/env")).resetEnvCache();
    restoreFetch = installRouteFetch(ROUTES).restore;
    const { agentApi } = await import("@modules/agents/ui/agent-client");

    const payload = await agentApi.candidateRender({
      questionId: "qualquer",
      field: "statementLatex",
      value: "x",
    });

    expect(payload.success).toBeUndefined();
    expect(payload.error).toBe("renderer_not_configured");
    expect(typeof payload.message).toBe("string");
  });

  it("reverter para uma revisão que não existe não lança: o histórico recarrega do mesmo jeito", async () => {
    restoreFetch = installRouteFetch(ROUTES).restore;
    const { agentApi } = await import("@modules/agents/ui/agent-client");

    await expect(
      agentApi.revertPatch({ questionId: "nao-existe", revisionNumber: 1 }),
    ).resolves.toBeUndefined();
  });
});

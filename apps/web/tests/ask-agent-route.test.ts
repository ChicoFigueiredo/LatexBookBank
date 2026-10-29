import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { resetEnvCache } from "@/shared/config/env";

import { jsonRequest, seedLibrary } from "./support/assessment-seed";
import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * Um turno do agente pela rota, contra um endpoint OpenAI-compatible de mentira.
 *
 * A rota montava provider, tools, registro da execução e diff (ARQ-09). Este arquivo é a rede para
 * levar a orquestração a um caso de uso: o que a rota responde, e o que fica registrado, não muda.
 */

let dispose: () => Promise<void>;
let endpoint: Server;
let endpointUrl: string;
/** Quantas chamadas o endpoint recebeu — a rota que recusa antes não pode chegar a ele. */
let chamadas = 0;

beforeAll(async () => {
  dispose = (await createTempDatabase()).dispose;

  endpoint = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      chamadas += 1;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          choices: [{ message: { content: "A questão pede a derivada." } }],
          usage: { prompt_tokens: 12, completion_tokens: 5 },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => endpoint.listen(0, "127.0.0.1", resolve));
  endpointUrl = `http://127.0.0.1:${(endpoint.address() as AddressInfo).port}/v1`;
});

afterAll(async () => {
  await new Promise((resolve) => endpoint.close(resolve));
  await dispose();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
  chamadas = 0;
});

function ambiente(vars: Record<string, string | undefined>) {
  vi.stubEnv("AI_BASE_URL", endpointUrl);
  vi.stubEnv("AI_MODEL", "modelo-de-texto");
  vi.stubEnv("AI_API_KEY", undefined);
  vi.stubEnv("AI_TOOL_CALLING", undefined);
  vi.stubEnv("RENDERER_BASE_URL", undefined);
  vi.stubEnv("RENDERER_SECRET", undefined);
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);
  resetEnvCache();
}

async function perguntar(body: Record<string, unknown>) {
  const { POST } = await import("../app/api/agents/ask/route");
  return POST(jsonRequest("POST", body));
}

describe("o turno do agente pela rota", () => {
  it("sem endpoint configurado é 503 ai_not_configured, sem chamar ninguém", async () => {
    ambiente({ AI_BASE_URL: undefined });

    const response = await perguntar({ prompt: "Oi" });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "ai_not_configured" });
    expect(chamadas).toBe(0);
  });

  it("sem modelo é 503 ai_model_missing", async () => {
    ambiente({ AI_MODEL: undefined });

    const response = await perguntar({ prompt: "Oi" });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "ai_model_missing" });
  });

  it("pergunta vazia é 400, antes de chamar o modelo", async () => {
    ambiente({});

    const response = await perguntar({ prompt: "   " });

    expect(response.status).toBe(400);
    expect(chamadas).toBe(0);
  });

  it("sem questão em foco, responde e não registra execução (não há onde ancorá-la)", async () => {
    ambiente({});

    const response = await perguntar({ prompt: "O que é uma derivada?" });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      answer: "A questão pede a derivada.",
      proposals: [],
      runId: null,
      error: null,
      usage: { inputTokens: 12, outputTokens: 5 },
    });
    expect(chamadas).toBe(1);
  });

  it("com questão em foco, registra a execução no workspace dela", async () => {
    ambiente({});
    const library = await seedLibrary("agente-registro");
    const { questionId } = await library.question({ type: "OPEN", statement: "Derive x^2." });

    const response = await perguntar({ prompt: "Explique.", questionId, mode: "REVIEW" });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { runId: string | null; proposals: unknown[] };
    expect(body.runId).toEqual(expect.any(String));
    expect(body.proposals).toEqual([]);

    const run = await library.prisma.agentRun.findUnique({
      where: { id: body.runId ?? "" },
      select: { workspaceId: true, questionId: true },
    });
    expect(run).toEqual({ workspaceId: library.workspace.id, questionId });
  });
});

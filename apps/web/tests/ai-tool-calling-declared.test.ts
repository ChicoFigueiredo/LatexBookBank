import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { resetEnvCache } from "@/shared/config/env";

import { createTempDatabase } from "./support/temp-database";

// Monta um SQLite com as migrações e sonda o TeX da máquina: com a suíte em paralelo passa dos 5 s.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * `AI_TOOL_CALLING=true` corrige o perfil — e quem descreve a IA precisa dizer o mesmo que a rota
 * do agente faz.
 *
 * Com o Ollama e `qwen3-coder:30b`, o agente usa ferramentas, mas o /diagnostico dizia "não": quem
 * investigava por que o agente respondeu sem consultar a questão ia atrás da configuração errada.
 */

let dispose: () => Promise<void>;

beforeAll(async () => {
  dispose = (await createTempDatabase()).dispose;
});
afterAll(async () => {
  await dispose();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

function ollamaWith(toolCalling: "true" | undefined) {
  vi.stubEnv("AI_BASE_URL", "http://127.0.0.1:11434/v1");
  vi.stubEnv("AI_MODEL", "qwen3-coder:30b");
  vi.stubEnv("AI_TOOL_CALLING", toolCalling);
  vi.stubEnv("RENDERER_BASE_URL", undefined);
  vi.stubEnv("RENDERER_SECRET", undefined);
  vi.stubEnv("BACKUP_DESTINATION", undefined);
  resetEnvCache();
}

const toolCallingLine = async () => {
  const { collectDiagnostics } =
    await import("@modules/diagnostics/application/collect-diagnostics");
  const diagnostics = await collectDiagnostics();
  return diagnostics.ai.details.find((detail) => detail.label === "Tool calling")?.value;
};

describe("tool calling declarado na configuração", () => {
  it('o /diagnostico diz "sim" quando AI_TOOL_CALLING=true', async () => {
    ollamaWith("true");
    expect(await toolCallingLine()).toBe("sim");
  });

  it('sem a declaração, o perfil do Ollama continua dizendo "não"', async () => {
    ollamaWith(undefined);
    expect(await toolCallingLine()).toBe("não");
  });

  it("o painel do agente recebe a mesma resposta", async () => {
    ollamaWith("true");
    const { describeAiSetup } = await import("@modules/agents/application/describe-ai-setup");
    expect(describeAiSetup()?.toolCalling).toBe(true);
  });
});

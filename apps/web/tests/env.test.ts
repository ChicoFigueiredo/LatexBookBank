import { describe, expect, it } from "vitest";

import { EnvError, loadEnv, type EnvSource } from "@/shared/config/env";

const base = { DATABASE_URL: "file:../data/test.db" } satisfies EnvSource;

describe("configuração de ambiente", () => {
  it("aceita o mínimo e aplica defaults", () => {
    const env = loadEnv(base);

    expect(env.databaseUrl).toBe("file:../data/test.db");
    expect(env.storageRoot).toBe("./data/storage");
    // O que ainda não chegou fica nulo em vez de string vazia — o consumidor checa presença.
    expect(env.rendererBaseUrl).toBeNull();
    expect(env.aiApiKey).toBeNull();
  });

  it("recusa DATABASE_URL ausente, e a mensagem diz o que fazer", () => {
    try {
      loadEnv({});
      expect.unreachable("deveria ter lançado");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      expect((error as Error).message).toContain("DATABASE_URL ausente");
      expect((error as Error).message).toContain("bun run setup");
    }
  });

  it("trata string vazia como ausente", () => {
    // `DATABASE_URL=` num .env é engano comum, e passar adiante daria erro obscuro no Prisma.
    expect(() => loadEnv({ DATABASE_URL: "   " })).toThrow(EnvError);
  });

  it("acumula todos os problemas numa mensagem só", () => {
    try {
      loadEnv({ RENDERER_BASE_URL: "nao-e-url", AI_BASE_URL: "tambem-nao" });
      expect.unreachable("deveria ter lançado");
    } catch (error) {
      const message = (error as Error).message;
      // Corrigir um por vez, subindo o app entre cada, é trabalho desnecessário.
      expect(message).toContain("DATABASE_URL");
      expect(message).toContain("RENDERER_BASE_URL");
      expect(message).toContain("AI_BASE_URL");
    }
  });

  it("recusa worker configurado sem segredo", () => {
    // Sem segredo, o worker aceitaria requisição de qualquer origem.
    expect(() => loadEnv({ ...base, RENDERER_BASE_URL: "http://localhost:28900" })).toThrow(
      /sem RENDERER_SECRET/,
    );
  });

  it("aceita worker com segredo", () => {
    const env = loadEnv({
      ...base,
      RENDERER_BASE_URL: "http://localhost:28900",
      RENDERER_SECRET: "s3gr3d0",
    });

    expect(env.rendererBaseUrl).toBe("http://localhost:28900");
    expect(env.rendererSecret).toBe("s3gr3d0");
  });

  it("recusa URL que não seja http(s)", () => {
    expect(() => loadEnv({ ...base, AI_BASE_URL: "file:///etc/passwd" })).toThrow(EnvError);
  });

  it("aceita endpoint OpenAI-compatible local", () => {
    const env = loadEnv({
      ...base,
      AI_BASE_URL: "http://127.0.0.1:11434/v1",
      AI_MODEL: "qwen3-coder:30b",
    });

    // Ollama não exige chave; o provider trata ausência como configuração válida (D3).
    expect(env.aiBaseUrl).toBe("http://127.0.0.1:11434/v1");
    expect(env.aiApiKey).toBeNull();
    expect(env.aiModel).toBe("qwen3-coder:30b");
  });
});

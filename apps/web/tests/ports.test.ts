import { describe, expect, expectTypeOf, it } from "vitest";

import {
  AiCredentialMissingError,
  AiProviderError,
  AssetNotFoundError,
  ConcurrencyConflictError,
  RendererUnavailableError,
  StorageKeyEscapeError,
  asStorageKey,
  type AiProvider,
  type RenderExecutor,
  type StorageProvider,
} from "@/shared/ports";

/**
 * As quatro fronteiras primárias são majoritariamente tipos — o `tsc --noEmit` já as verifica.
 * O que sobra para o runtime, e que importa de verdade, são os erros: o fluxo os distingue por
 * **tipo**, não por mensagem, e quebrar essa distinção quebra tratamento a jusante em silêncio.
 */

describe("StorageKey é opaca", () => {
  it("não aceita string crua onde a chave é exigida", () => {
    const key = asStorageKey("ws_1/ab/abcdef.png");
    expectTypeOf(key).not.toEqualTypeOf<string>();
    expect(String(key)).toBe("ws_1/ab/abcdef.png");
  });
});

describe("erros de storage", () => {
  it("AssetNotFoundError carrega a chave que faltou", () => {
    const key = asStorageKey("ws_1/de/adbeef.pdf");
    const error = new AssetNotFoundError(key);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AssetNotFoundError");
    expect(error.storageKey).toBe(key);
  });

  it("StorageKeyEscapeError nomeia workspace e tentativa", () => {
    const error = new StorageKeyEscapeError("ws_1", "../ws_2/segredo.pdf");

    expect(error.name).toBe("StorageKeyEscapeError");
    expect(error.workspaceId).toBe("ws_1");
    expect(error.attempted).toBe("../ws_2/segredo.pdf");
  });
});

describe("conflito de concorrência", () => {
  it("é um tipo próprio, para não ser confundido com falha de escrita", () => {
    const read = new Date("2026-08-07T10:00:00Z");
    const now = new Date("2026-08-07T10:05:00Z");
    const error = new ConcurrencyConflictError("Question", "q_1", read, now);

    expect(error).toBeInstanceOf(ConcurrencyConflictError);
    expect(error.name).toBe("ConcurrencyConflictError");
    expect(error.entityId).toBe("q_1");
    // A mensagem mostra as duas versões: o usuário precisa entender o que mudou, não só que falhou.
    expect(error.message).toContain("mudou desde a leitura");
  });
});

describe("erros de IA", () => {
  it("credencial ausente é erro de configuração, e instrui", () => {
    const error = new AiCredentialMissingError("openrouter", "OPENROUTER_API_KEY");

    expect(error).toBeInstanceOf(AiProviderError);
    expect(error.providerId).toBe("openrouter");
    expect(error.message).toContain("OPENROUTER_API_KEY");
    expect(error.message).toContain(".env.local");
  });

  it("preserva a causa original", () => {
    const cause = new Error("ECONNREFUSED");
    const error = new AiProviderError("falha ao listar modelos", "ollama", cause);

    expect(error.cause).toBe(cause);
  });
});

describe("renderer indisponível", () => {
  it("carrega a baseUrl para a mensagem poder ser acionável", () => {
    const error = new RendererUnavailableError("http://localhost:28900");

    expect(error.name).toBe("RendererUnavailableError");
    expect(error.baseUrl).toBe("http://localhost:28900");
  });
});

describe("forma dos contratos", () => {
  it("StorageProvider expõe put/get/exists/delete", () => {
    expectTypeOf<StorageProvider>().toHaveProperty("put");
    expectTypeOf<StorageProvider>().toHaveProperty("get");
    expectTypeOf<StorageProvider>().toHaveProperty("exists");
    expectTypeOf<StorageProvider>().toHaveProperty("delete");
  });

  it("RenderExecutor recebe um bundle e devolve bytes — nunca persiste (D35)", () => {
    expectTypeOf<RenderExecutor>().toHaveProperty("render");
    // Se um dia alguém acrescentar `storage` aqui, a contradição do egress volta.
    expectTypeOf<RenderExecutor>().not.toHaveProperty("storage");
  });

  it("AiProvider tem stream opcional — nem todo endpoint compatível suporta", () => {
    expectTypeOf<AiProvider>().toHaveProperty("run");
    expectTypeOf<AiProvider["stream"]>().toBeNullable();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OpenAiCompatibleProvider,
  parseCompletion,
} from "@modules/agents/infrastructure/openai-compatible-provider";
import { AiCredentialMissingError, AiProviderError } from "@/shared/ports";

/**
 * Testes de contrato com **respostas gravadas**.
 *
 * As cargas abaixo são recortes reais do que cada endpoint devolve. É o único jeito de cobrir os
 * quatro perfis sem depender de quatro serviços no ar — e de continuar cobrindo quando o Chico
 * estiver offline, que é o modo primário (D21).
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Grava o que foi pedido e devolve a resposta combinada. */
function stubFetch(response: unknown, init: { status?: number; body?: string } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, requestInit: RequestInit) => {
      calls.push({ url, init: requestInit });
      return Promise.resolve(
        new Response(init.body ?? JSON.stringify(response), {
          status: init.status ?? 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }),
  );

  return calls;
}

const OPENROUTER = { baseUrl: "https://openrouter.ai/api/v1", apiKey: "sk-or-teste" };
const OLLAMA = { baseUrl: "http://127.0.0.1:11434/v1", apiKey: null };

/** Resposta de texto — recorte de `POST /chat/completions` do OpenRouter. */
const TEXT_COMPLETION = {
  id: "gen-1",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "A alternativa correta é a **C**." },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 412, completion_tokens: 37, total_tokens: 449 },
};

/** Resposta com tool calling — o mesmo formato em OpenAI e OpenRouter. */
const TOOL_COMPLETION = {
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_a1",
            type: "function",
            function: { name: "buscar_questao", arguments: '{"id":"q-42"}' },
          },
        ],
      },
      finish_reason: "tool_calls",
    },
  ],
};

describe("credencial", () => {
  it("perfil remoto sem chave falha na construção, não na terceira chamada", () => {
    expect(() => new OpenAiCompatibleProvider({ ...OPENROUTER, apiKey: null })).toThrow(
      AiCredentialMissingError,
    );
  });

  it("o Ollama sobe sem chave", () => {
    expect(new OpenAiCompatibleProvider(OLLAMA).id).toBe("ollama");
  });

  it("a chave vai no header, não na URL", () => {
    // Na URL ela vazaria para log de acesso, histórico e referer.
    const calls = stubFetch(TEXT_COMPLETION);
    const provider = new OpenAiCompatibleProvider(OPENROUTER);

    return provider.run({ model: "m", messages: [{ role: "user", content: "oi" }] }).then(() => {
      expect(calls[0]?.url).not.toContain("sk-or-teste");
      expect((calls[0]?.init.headers as Record<string, string>)["authorization"]).toBe(
        "Bearer sk-or-teste",
      );
    });
  });

  it("sem chave, nenhum header de autorização é inventado", async () => {
    const calls = stubFetch(TEXT_COMPLETION);
    await new OpenAiCompatibleProvider(OLLAMA).run({
      model: "qwen",
      messages: [{ role: "user", content: "oi" }],
    });

    expect((calls[0]?.init.headers as Record<string, string>)["authorization"]).toBeUndefined();
  });
});

describe("listagem de modelos", () => {
  it("lê a rota `/models`", async () => {
    const calls = stubFetch({ data: [{ id: "openai/gpt-4o" }, { id: "qwen/qwen3-30b" }] });
    const models = await new OpenAiCompatibleProvider(OPENROUTER).listModels();

    expect(calls[0]?.url).toBe("https://openrouter.ai/api/v1/models");
    expect(models.map((m) => m.id)).toEqual(["openai/gpt-4o", "qwen/qwen3-30b"]);
  });

  it("as capacidades vêm do perfil — nenhuma API compatível as declara", async () => {
    stubFetch({ data: [{ id: "qwen3" }] });
    const [model] = await new OpenAiCompatibleProvider(OLLAMA).listModels();

    expect(model?.capabilities.toolCalling).toBe(false);
  });

  it("endpoint que não lista devolve vazio, sem chamar a rede", async () => {
    // A interface pede o nome do modelo; um seletor vazio pareceria defeito.
    const calls = stubFetch({});
    const models = await new OpenAiCompatibleProvider({
      baseUrl: "https://meu-endpoint.invalido/v1",
      apiKey: null,
    }).listModels();

    expect(models).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("entrada sem `id` é descartada em vez de virar modelo sem nome", async () => {
    stubFetch({ data: [{ id: "bom" }, { object: "model" }] });
    const models = await new OpenAiCompatibleProvider(OPENROUTER).listModels();

    expect(models.map((m) => m.id)).toEqual(["bom"]);
  });
});

describe("execução", () => {
  it("a barra final da baseURL não vira barra dupla", async () => {
    const calls = stubFetch(TEXT_COMPLETION);
    await new OpenAiCompatibleProvider({
      ...OPENROUTER,
      baseUrl: "https://openrouter.ai/api/v1/",
    }).run({ model: "m", messages: [{ role: "user", content: "oi" }] });

    expect(calls[0]?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  it("resultado de tool vira mensagem `tool` com o id da chamada", async () => {
    const calls = stubFetch(TEXT_COMPLETION);
    await new OpenAiCompatibleProvider(OPENROUTER).run({
      model: "m",
      messages: [{ role: "tool", result: { toolCallId: "call_a1", output: "42" } }],
    });

    const body = JSON.parse(String(calls[0]?.init.body)) as { messages: unknown[] };
    expect(body.messages[0]).toEqual({ role: "tool", tool_call_id: "call_a1", content: "42" });
  });

  it("tool que falhou vira **conteúdo**, não exceção", async () => {
    // O modelo precisa ler que a tool falhou para tentar outra coisa; abortar aqui transformaria
    // um erro recuperável em fim de fluxo.
    const calls = stubFetch(TEXT_COMPLETION);
    await new OpenAiCompatibleProvider(OPENROUTER).run({
      model: "m",
      messages: [
        { role: "tool", result: { toolCallId: "c1", output: "sem permissão", isError: true } },
      ],
    });

    const body = JSON.parse(String(calls[0]?.init.body)) as { messages: { content: string }[] };
    expect(body.messages[0]?.content).toBe("ERRO: sem permissão");
  });

  it("campos opcionais ausentes não viram `undefined` no corpo", async () => {
    // `temperature: undefined` faz alguns endpoints devolverem 400.
    const calls = stubFetch(TEXT_COMPLETION);
    await new OpenAiCompatibleProvider(OPENROUTER).run({
      model: "m",
      messages: [{ role: "user", content: "oi" }],
    });

    const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["messages", "model"]);
  });

  it("perfil sem tool calling **recusa** tools em vez de mandá-las", async () => {
    // Mandar para um endpoint que não as entende dá 400 em alguns e silêncio em outros — e o
    // silêncio é pior, porque vira texto onde o código espera uma chamada.
    stubFetch(TEXT_COMPLETION);
    const provider = new OpenAiCompatibleProvider(OLLAMA);

    await expect(
      provider.run({
        model: "qwen",
        messages: [{ role: "user", content: "oi" }],
        tools: [{ name: "t", description: "d", inputSchema: { type: "object" } }],
      }),
    ).rejects.toThrow(/tool calling/);
  });

  it("a configuração pode corrigir o perfil quando o modelo sabe mais", async () => {
    // `qwen3-coder:30b` e `devstral` fazem tool calling de verdade. O perfil protege o caso comum;
    // sem esta saída ele bloquearia o caso bom.
    const calls = stubFetch(TOOL_COMPLETION);
    const provider = new OpenAiCompatibleProvider({
      ...OLLAMA,
      capabilities: { toolCalling: true },
    });

    await provider.run({
      model: "qwen3-coder:30b",
      messages: [{ role: "user", content: "oi" }],
      tools: [{ name: "t", description: "d", inputSchema: { type: "object" } }],
    });

    expect(JSON.parse(String(calls[0]?.init.body))).toHaveProperty("tools");
    // A correção é cirúrgica: o resto do perfil continua valendo.
    expect(provider.capabilities.vision).toBe(false);
  });

  it("perfil com tool calling manda as tools no formato `function`", async () => {
    const calls = stubFetch(TOOL_COMPLETION);
    await new OpenAiCompatibleProvider(OPENROUTER).run({
      model: "m",
      messages: [{ role: "user", content: "oi" }],
      tools: [{ name: "buscar_questao", description: "Busca", inputSchema: { type: "object" } }],
    });

    const body = JSON.parse(String(calls[0]?.init.body)) as { tools: unknown[] };
    expect(body.tools).toEqual([
      {
        type: "function",
        function: { name: "buscar_questao", description: "Busca", parameters: { type: "object" } },
      },
    ]);
  });

  it("HTTP de erro vira `AiProviderError` com o corpo truncado", async () => {
    // Alguns endpoints devolvem uma página HTML inteira; jogar isso na mensagem enterraria a
    // única linha útil.
    stubFetch(null, { status: 429, body: "x".repeat(5_000) });

    await expect(
      new OpenAiCompatibleProvider(OPENROUTER).run({
        model: "m",
        messages: [{ role: "user", content: "oi" }],
      }),
    ).rejects.toThrow(/HTTP 429/);
  });

  it("falha de rede vira erro com o endereço, não um `TypeError: fetch failed`", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))),
    );

    // O caso do Ollama desligado — o mais comum de todos.
    await expect(
      new OpenAiCompatibleProvider(OLLAMA).run({
        model: "qwen",
        messages: [{ role: "user", content: "oi" }],
      }),
    ).rejects.toThrow(/127\.0\.0\.1:11434/);
  });
});

describe("leitura da resposta", () => {
  it("texto, uso e parada", () => {
    const result = parseCompletion(TEXT_COMPLETION, "openrouter");

    expect(result.text).toBe("A alternativa correta é a **C**.");
    expect(result.toolCalls).toEqual([]);
    expect(result.usage).toEqual({ inputTokens: 412, outputTokens: 37 });
    expect(result.stopReason).toBe("end");
  });

  it("tool call com argumento decodificado", () => {
    const result = parseCompletion(TOOL_COMPLETION, "openrouter");

    expect(result.toolCalls).toEqual([
      { id: "call_a1", name: "buscar_questao", input: { id: "q-42" } },
    ]);
    expect(result.stopReason).toBe("tool_use");
    // `content: null` vira string vazia: quem consome não deve checar `null` a cada uso.
    expect(result.text).toBe("");
  });

  it("argumento que não é JSON vira objeto vazio, não exceção", () => {
    // Modelo faz isso. A validação de input da tool recusa com mensagem — melhor que derrubar o
    // turno inteiro.
    const result = parseCompletion(
      {
        choices: [
          {
            message: {
              tool_calls: [{ id: "c", function: { name: "t", arguments: "{id: q-42" } }],
            },
          },
        ],
      },
      "openrouter",
    );

    expect(result.toolCalls[0]?.input).toEqual({});
  });

  it("`finish_reason: length` é distinguido de fim normal", () => {
    // O painel precisa poder dizer "a resposta foi cortada" em vez de mostrar meia frase.
    const result = parseCompletion(
      { choices: [{ message: { content: "meia fra" }, finish_reason: "length" }] },
      "openrouter",
    );

    expect(result.stopReason).toBe("max_tokens");
  });

  it("Ollama sem `usage` não inventa contagem", () => {
    const result = parseCompletion(
      { choices: [{ message: { content: "oi" }, finish_reason: "stop" }] },
      "ollama",
    );

    expect(result.usage).toBeUndefined();
  });

  it("resposta sem escolha nenhuma é erro, não texto vazio", () => {
    expect(() => parseCompletion({ choices: [] }, "custom")).toThrow(AiProviderError);
  });
});

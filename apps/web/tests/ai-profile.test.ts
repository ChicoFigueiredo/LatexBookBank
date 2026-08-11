import { describe, expect, it } from "vitest";

import {
  AI_PROFILES,
  AI_PROFILE_IDS,
  isAiProfileId,
  profileById,
  profileForBaseUrl,
} from "@modules/agents/domain/ai-profile";

/**
 * Os perfis existem para uma coisa: dizer o que se pode assumir **sem** perguntar ao endpoint.
 *
 * O caso que dói é o Ollama. A máquina do Chico é o ambiente primário (D21), e a maioria dos
 * modelos abertos não faz tool calling — assumir que faz é como o painel agêntico quebraria em
 * silêncio, devolvendo texto onde o código espera uma chamada.
 */

describe("matriz de capacidades", () => {
  it("o Ollama **não** promete tool calling", () => {
    expect(AI_PROFILES.ollama.assumedCapabilities.toolCalling).toBe(false);
  });

  it("um endpoint desconhecido não promete nada", () => {
    // Descobrir que ele suporta mais é barato; descobrir que suporta menos, no meio de um fluxo,
    // não é.
    expect(AI_PROFILES.custom.assumedCapabilities).toEqual({
      toolCalling: false,
      streaming: false,
      vision: false,
    });
  });

  it("nenhum perfil assume visão", () => {
    // Mandar imagem para um modelo sem visão dá erro do provider no meio da Fase 15. Quem tem
    // visão declara na hora de escolher o modelo, que é onde a informação existe.
    for (const id of AI_PROFILE_IDS) {
      expect(AI_PROFILES[id].assumedCapabilities.vision).toBe(false);
    }
  });

  it("só os serviços remotos exigem chave", () => {
    // Exigir chave no Ollama transformaria "rodar offline na sua máquina" numa configuração com
    // segredo para gerenciar — o oposto do ponto.
    expect(AI_PROFILES.openrouter.requiresApiKey).toBe(true);
    expect(AI_PROFILES.openai.requiresApiKey).toBe(true);
    expect(AI_PROFILES.ollama.requiresApiKey).toBe(false);
    expect(AI_PROFILES.custom.requiresApiKey).toBe(false);
  });

  it("cada perfil se identifica com a própria chave", () => {
    for (const id of AI_PROFILE_IDS) expect(AI_PROFILES[id].id).toBe(id);
  });
});

describe("perfil a partir da URL", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["https://openrouter.ai/api/v1", "openrouter"],
    ["https://api.openai.com/v1", "openai"],
    ["http://127.0.0.1:11434/v1", "ollama"],
    ["http://localhost:11434/v1", "ollama"],
    ["http://meu-servidor.local:8000/v1", "custom"],
  ];

  for (const [url, expected] of cases) {
    it(`${url} → ${expected}`, () => {
      expect(profileForBaseUrl(url).id).toBe(expected);
    });
  }

  it("não se importa com caixa alta", () => {
    // A URL vem do `.env.local`, digitada à mão.
    expect(profileForBaseUrl("https://OpenRouter.AI/api/v1").id).toBe("openrouter");
  });

  it("o default é o conservador, não o OpenRouter", () => {
    // Errar para "custom" só perde padrões; errar para "openrouter" prometeria tool calling que o
    // endpoint pode não ter.
    expect(profileForBaseUrl("https://exemplo.invalido/v1").id).toBe("custom");
  });
});

describe("perfil por id", () => {
  it("aceita os quatro conhecidos", () => {
    for (const id of AI_PROFILE_IDS) expect(profileById(id)?.id).toBe(id);
  });

  it("devolve `null` para o que não existe — não um perfil inventado", () => {
    expect(profileById("anthropic")).toBeNull();
    expect(isAiProfileId("anthropic")).toBe(false);
  });
});

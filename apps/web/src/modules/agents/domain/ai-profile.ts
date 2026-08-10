import type { AiModelCapabilities } from "@/shared/ports";

/**
 * Os perfis de provider.
 *
 * D3: **um** `OpenAiCompatibleProvider` com `baseURL` configurável cobre todos. O perfil não é uma
 * implementação — é um conjunto de valores padrão mais uma declaração de **o que aquele endpoint
 * sabe fazer**.
 *
 * A matriz de capacidades é o motivo de o perfil existir. Modelos locais variam muito em tool
 * calling, e assumir suporte é como o painel agêntico quebra em silêncio: o modelo devolve texto
 * onde o código espera uma chamada de tool, e a interface mostra uma resposta vazia sem dizer por
 * quê. Declarado, o runner sabe quando cair para JSON estruturado no prompt.
 */

export const AI_PROFILE_IDS = ["openrouter", "openai", "ollama", "custom"] as const;
export type AiProfileId = (typeof AI_PROFILE_IDS)[number];

export const isAiProfileId = (value: string): value is AiProfileId =>
  (AI_PROFILE_IDS as readonly string[]).includes(value);

export interface AiProfile {
  readonly id: AiProfileId;
  readonly label: string;
  /** Sugestão; o valor efetivo vem sempre de `AI_BASE_URL`. */
  readonly defaultBaseUrl: string | null;
  /**
   * `false` quando o endpoint aceita chamada sem chave.
   *
   * O Ollama local é o caso: exigir chave lá transformaria "rodar offline na sua máquina" numa
   * configuração com segredo para gerenciar, que é o oposto do ponto.
   */
  readonly requiresApiKey: boolean;
  /** O que se pode assumir **sem** perguntar ao endpoint. */
  readonly assumedCapabilities: AiModelCapabilities;
  /**
   * `true` quando o endpoint tem uma rota `/models` utilizável.
   *
   * O OpenRouter e o Ollama listam; um endpoint custom pode não listar, e nesse caso a interface
   * pede o nome do modelo em vez de mostrar um seletor vazio que parece defeito.
   */
  readonly listsModels: boolean;
}

/**
 * `vision: false` por padrão em todos.
 *
 * É o valor seguro: assumir visão e mandar imagem para um modelo que não a aceita produz erro do
 * provider no meio de um fluxo (Fase 15, reconhecimento matemático). Quem tem visão declara na
 * hora de escolher o modelo, que é onde a informação de fato existe.
 */
const TEXT_ONLY: AiModelCapabilities = { toolCalling: true, streaming: true, vision: false };

export const AI_PROFILES: Readonly<Record<AiProfileId, AiProfile>> = {
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    requiresApiKey: true,
    assumedCapabilities: TEXT_ONLY,
    listsModels: true,
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    requiresApiKey: true,
    assumedCapabilities: TEXT_ONLY,
    listsModels: true,
  },
  ollama: {
    id: "ollama",
    label: "Ollama local",
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    requiresApiKey: false,
    // **Tool calling não é assumido.** A máquina do Chico tem treze modelos, e a maioria dos
    // modelos abertos ou não suporta tool calling ou suporta mal. Assumir `true` faria o painel
    // parecer quebrado justamente no ambiente que a D21 escolheu como primário.
    assumedCapabilities: { toolCalling: false, streaming: true, vision: false },
    listsModels: true,
  },
  custom: {
    id: "custom",
    label: "Endpoint compatível",
    defaultBaseUrl: null,
    requiresApiKey: false,
    // Um endpoint desconhecido não promete nada. Descobrir que ele suporta mais é barato;
    // descobrir que suporta menos, no meio de um fluxo, não é.
    assumedCapabilities: { toolCalling: false, streaming: false, vision: false },
    listsModels: false,
  },
};

export const profileById = (id: string): AiProfile | null =>
  isAiProfileId(id) ? AI_PROFILES[id] : null;

/**
 * Adivinha o perfil a partir da URL.
 *
 * Serve para o `.env.local` que só tem `AI_BASE_URL` — que é o caso comum, porque a configuração
 * nasceu antes dos perfis existirem. Errar aqui é barato: o perfil só decide **padrões**, e a
 * capacidade real continua sendo verificável pelo botão "testar conexão".
 */
export function profileForBaseUrl(baseUrl: string): AiProfile {
  const url = baseUrl.toLowerCase();

  if (url.includes("openrouter.ai")) return AI_PROFILES.openrouter;
  if (url.includes("api.openai.com")) return AI_PROFILES.openai;
  if (url.includes("11434") || url.includes("ollama")) return AI_PROFILES.ollama;
  return AI_PROFILES.custom;
}

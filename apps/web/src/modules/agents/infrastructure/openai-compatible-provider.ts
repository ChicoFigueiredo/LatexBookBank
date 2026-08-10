import "server-only";

import {
  AiCredentialMissingError,
  AiProviderError,
  type AgentRequest,
  type AgentResult,
  type AiMessage,
  type AiModel,
  type AiModelCapabilities,
  type AiProvider,
  type AiToolCall,
} from "@/shared/ports";
import { env } from "@/shared/config/env";

import { profileForBaseUrl, type AiProfile } from "../domain/ai-profile";

/**
 * O provider — **um só**, com `baseURL` configurável (D3).
 *
 * OpenRouter, OpenAI, Ollama, LM Studio e qualquer endpoint compatível falam o mesmo protocolo.
 * Escrever um adaptador por serviço seria manter quatro cópias de um cliente HTTP que só diferem
 * no endereço — e a quarta ficaria para trás.
 *
 * ## `server-only` não é decoração
 *
 * O import no topo faz o build **falhar** se algum Client Component alcançar este módulo, mesmo
 * por engano transitivo. É o que garante o requisito da spec §5.6: a chave existe apenas no
 * servidor e nunca chega ao browser. Há teste de fronteira afirmando isso.
 */

export interface ProviderConfig {
  readonly baseUrl: string;
  readonly apiKey: string | null;
  readonly defaultModel?: string;
  readonly timeoutMs?: number;
  /**
   * Corrige o perfil quando o endpoint sabe mais do que ele assume.
   *
   * O perfil declara o **conservador**, e é o certo por padrão. Mas o Ollama da máquina do Chico
   * tem treze modelos, e alguns — `qwen3-coder:30b`, `devstral` — fazem tool calling de verdade.
   * Sem esta saída, o perfil que protege o caso comum bloquearia o caso bom.
   */
  readonly capabilities?: Partial<AiModelCapabilities>;
}

const DEFAULT_TIMEOUT_MS = 120_000;

/** Formato de mensagem que a API compatível espera. */
interface WireMessage {
  role: string;
  content: string | null;
  tool_call_id?: string;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
}

function toWire(message: AiMessage): WireMessage {
  if (message.role === "tool") {
    return {
      role: "tool",
      tool_call_id: message.result.toolCallId,
      // O erro vai como **conteúdo**, não como exceção: o modelo precisa ler que a tool falhou
      // para tentar outra coisa. Abortar aqui transformaria um erro recuperável em fim de fluxo.
      content: message.result.isError ? `ERRO: ${message.result.output}` : message.result.output,
    };
  }
  return { role: message.role, content: message.content };
}

export class OpenAiCompatibleProvider implements AiProvider {
  readonly id: string;
  private readonly profile: AiProfile;
  /** O que o perfil assume, já corrigido pelo que a configuração declarou saber. */
  readonly capabilities: AiModelCapabilities;

  constructor(private readonly config: ProviderConfig) {
    this.profile = profileForBaseUrl(config.baseUrl);
    this.id = this.profile.id;
    this.capabilities = { ...this.profile.assumedCapabilities, ...config.capabilities };

    if (this.profile.requiresApiKey && !config.apiKey) {
      // Falta de credencial é erro de **configuração**, não de rede, e merece instrução em vez de
      // um 401 cru três chamadas adiante.
      throw new AiCredentialMissingError(this.profile.id, "AI_API_KEY");
    }
  }

  async listModels(): Promise<readonly AiModel[]> {
    if (!this.profile.listsModels) {
      // Endpoint que não lista não é erro: a interface pede o nome do modelo em vez de mostrar
      // um seletor vazio, que pareceria defeito.
      return [];
    }

    const response = await this.fetch("/models", { method: "GET" });
    const payload = (await response.json()) as { data?: { id?: string }[] };

    return (payload.data ?? [])
      .flatMap((entry) => (typeof entry.id === "string" ? [entry.id] : []))
      .map((id) => ({
        id,
        // As capacidades vêm do **perfil**, não do endpoint: nenhuma API compatível declara se o
        // modelo faz tool calling, e inventar a resposta seria pior que assumir o conservador.
        // Quem sabe mais corrige pela configuração.
        capabilities: this.capabilities,
      }));
  }

  async run(request: AgentRequest): Promise<AgentResult> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map(toWire),
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      ...(request.maxTokens === undefined ? {} : { max_tokens: request.maxTokens }),
    };

    // Tools só vão para o endpoint quando o perfil declara suporte. Mandá-las para um endpoint
    // que não as entende dá 400 em alguns e **silêncio** em outros — e o silêncio é pior, porque
    // vira uma resposta de texto onde o código espera uma chamada.
    if (request.tools !== undefined && request.tools.length > 0) {
      if (!this.capabilities.toolCalling) {
        throw new AiProviderError(
          `O perfil \`${this.profile.label}\` não declara suporte a tool calling. ` +
            "Use um modelo que suporte, ou o modo sem tools.",
          this.id,
        );
      }
      body["tools"] = request.tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      }));
    }

    const response = await this.fetch("/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      ...(request.signal ? { signal: request.signal } : {}),
    });

    return parseCompletion(await response.json(), this.id);
  }

  private async fetch(path: string, init: RequestInit): Promise<Response> {
    const url = `${this.config.baseUrl.replace(/\/$/, "")}${path}`;

    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        signal: init.signal ?? AbortSignal.timeout(this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AiProviderError(
        `Não foi possível falar com ${this.config.baseUrl}.`,
        this.id,
        error,
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new AiProviderError(
        // O corpo é truncado: alguns endpoints devolvem HTML de página de erro inteiro, e jogar
        // isso na mensagem enterraria a única linha útil.
        `${this.config.baseUrl} recusou: HTTP ${response.status}. ${detail.slice(0, 300)}`.trim(),
        this.id,
      );
    }

    return response;
  }
}

/**
 * O provider configurado pelo ambiente, ou `null` quando não há IA configurada.
 *
 * `null` e não exceção: o app inteiro funciona sem IA — o painel agêntico é um acessório, não um
 * requisito. Quem chama decide o que dizer ("configure `AI_BASE_URL`"), e a Fase 8 termina com o
 * painel desabilitado em vez de a aplicação não subir.
 */
export function providerFromEnv(): OpenAiCompatibleProvider | null {
  const { aiBaseUrl, aiApiKey, aiModel } = env();
  if (!aiBaseUrl) return null;

  return new OpenAiCompatibleProvider({
    baseUrl: aiBaseUrl,
    apiKey: aiApiKey,
    ...(aiModel ? { defaultModel: aiModel } : {}),
  });
}

/**
 * Lê a resposta no formato compatível.
 *
 * Exportada para o teste de contrato: as respostas gravadas são exercitadas aqui, sem rede, o que
 * é o único jeito de cobrir os formatos dos quatro perfis sem depender de quatro serviços.
 */
export function parseCompletion(payload: unknown, providerId: string): AgentResult {
  const choice = (payload as { choices?: unknown[] })?.choices?.[0] as
    | {
        message?: {
          content?: string | null;
          tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
        };
        finish_reason?: string;
      }
    | undefined;

  if (choice === undefined) {
    throw new AiProviderError("A resposta não trouxe nenhuma escolha.", providerId);
  }

  const toolCalls: AiToolCall[] = (choice.message?.tool_calls ?? []).flatMap((call) => {
    const name = call.function?.name;
    if (typeof name !== "string") return [];

    let input: unknown = {};
    try {
      input = JSON.parse(call.function?.arguments ?? "{}");
    } catch {
      // Argumento que não é JSON é coisa que modelo faz. Vira objeto vazio, e a validação de
      // input da tool recusa com mensagem — melhor que derrubar o turno inteiro.
      input = {};
    }

    return [{ id: call.id ?? name, name, input }];
  });

  const usage = (payload as { usage?: { prompt_tokens?: number; completion_tokens?: number } })
    ?.usage;

  return {
    text: choice.message?.content ?? "",
    toolCalls,
    ...(usage
      ? {
          usage: {
            ...(usage.prompt_tokens === undefined ? {} : { inputTokens: usage.prompt_tokens }),
            ...(usage.completion_tokens === undefined
              ? {}
              : { outputTokens: usage.completion_tokens }),
          },
        }
      : {}),
    stopReason: mapStopReason(choice.finish_reason, toolCalls.length > 0),
  };
}

function mapStopReason(
  reason: string | undefined,
  hasToolCalls: boolean,
): NonNullable<AgentResult["stopReason"]> {
  if (reason === "tool_calls" || hasToolCalls) return "tool_use";
  if (reason === "length") return "max_tokens";
  return "end";
}

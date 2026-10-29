/**
 * Fronteira primária: **IA**.
 *
 * Um único `OpenAiCompatibleProvider` com `baseURL` configurável cobre OpenRouter (padrão),
 * OpenAI, Ollama local, LM Studio e qualquer endpoint compatível — um provider, não vários (D3).
 *
 * A chave existe apenas no servidor e nunca chega ao browser. O modelo não recebe secrets.
 *
 * Ver `docs/_atual/_planejamento.md` §4.7 · D3 · spec §5.6 e §14.
 */

/**
 * O que um modelo sabe fazer. Modelos locais variam muito em tool calling, e assumir suporte
 * é como o painel agêntico quebra em silêncio — daí a matriz explícita (D3).
 */
export interface AiModelCapabilities {
  /** Tool calling nativo. Quando falso, o runner cai para JSON estruturado no prompt. */
  readonly toolCalling: boolean;
  readonly streaming: boolean;
  /** Necessário para reconhecimento matemático a partir de crop (Fase 15). */
  readonly vision: boolean;
}

export interface AiModel {
  readonly id: string;
  readonly label?: string;
  readonly capabilities: AiModelCapabilities;
  readonly contextWindow?: number;
}

/** Tool exposta ao modelo. Definida **pelo servidor**, nunca pelo modelo (spec §35). */
export interface AiToolDefinition {
  readonly name: string;
  readonly description: string;
  /** JSON Schema. O input é validado antes de a tool executar. */
  readonly inputSchema: Record<string, unknown>;
}

export interface AiToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}

export interface AiToolResult {
  readonly toolCallId: string;
  /** Truncado pelo servidor: output de tool tem limite (spec §35). */
  readonly output: string;
  readonly isError?: boolean;
}

/**
 * Uma imagem que vai junto do texto, para o modelo multimodal — o recorte que o reconhecimento
 * matemático transcreve. Os bytes, e não um endereço: o recorte pode nem estar no storage ainda.
 */
export interface AiImage {
  readonly mimeType: string;
  readonly data: Uint8Array;
}

export type AiMessage =
  | { readonly role: "system"; readonly content: string }
  | {
      readonly role: "user";
      readonly content: string;
      /** Depois do texto, na ordem. Só um modelo com visão as lê. */
      readonly images?: readonly AiImage[];
    }
  | {
      readonly role: "assistant";
      readonly content: string;
      /**
       * As chamadas que o assistente fez nesta mensagem. A OpenAI e o OpenRouter recusam com 400
       * uma mensagem `tool` que não responda a uma `tool_calls` anterior — o Ollama aceita, e foi
       * por isso que a falta passou despercebida.
       */
      readonly toolCalls?: readonly AiToolCall[];
    }
  | { readonly role: "tool"; readonly result: AiToolResult };

export interface AgentRequest {
  readonly model: string;
  readonly messages: readonly AiMessage[];
  readonly tools?: readonly AiToolDefinition[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly signal?: AbortSignal;
}

export interface AiUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  /** Quando o provider reporta. Exibido no `ToolCallCard` (spec §14.6). */
  readonly costUsd?: number;
}

export interface AgentResult {
  readonly text: string;
  readonly toolCalls: readonly AiToolCall[];
  readonly usage?: AiUsage;
  readonly stopReason?: "end" | "tool_use" | "max_tokens" | "aborted";
}

export type AgentEvent =
  | { readonly type: "text-delta"; readonly text: string }
  | { readonly type: "tool-call"; readonly call: AiToolCall }
  | { readonly type: "done"; readonly result: AgentResult }
  | { readonly type: "error"; readonly error: AiProviderError };

export interface AiProvider {
  readonly id: string;
  listModels(): Promise<readonly AiModel[]>;
  run(request: AgentRequest): Promise<AgentResult>;
  stream?(request: AgentRequest): AsyncIterable<AgentEvent>;
}

/**
 * O endpoint que a configuração aponta: a porta, e o que o perfil dele sabe fazer. Sem tool calling
 * o turno do agente degrada para JSON no prompt em vez de falhar, e quem decide isso precisa saber.
 */
export interface ConfiguredAiProvider extends AiProvider {
  readonly capabilities: AiModelCapabilities;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly providerId: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

/**
 * Falta de credencial é erro de configuração, não de rede — e merece instrução clara em vez de
 * um 401 cru (spec §35).
 */
export class AiCredentialMissingError extends AiProviderError {
  constructor(providerId: string, envVar: string) {
    super(`Credencial ausente para ${providerId}. Defina ${envVar} em .env.local`, providerId);
    this.name = "AiCredentialMissingError";
  }
}

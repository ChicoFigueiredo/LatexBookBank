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

export type AiMessage =
  | { readonly role: "system" | "user" | "assistant"; readonly content: string }
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

import type { AgentRequest, AiMessage, AiProvider, AiToolCall } from "@/shared/ports";

import { renderContext, type AgentContext } from "../domain/agent-context";
import { profileForMode } from "../domain/agent-mode";
import {
  ASK_SYSTEM_PROMPT_NO_TOOLS,
  summarize,
  summarizeToolInput,
  type AgentMode,
  type AgentRunRecord,
  type ToolCallRecord,
} from "../domain/agent-run";
import { ToolInputError, type AgentTool } from "../domain/tool-contract";

/**
 * O laço do turno: pergunta → tools → pergunta de novo → resposta.
 *
 * O modelo pede tools; o servidor executa **as que existem** e devolve o resultado como mensagem.
 * Isso se repete até o modelo responder em texto ou até o teto de iterações — o que vier antes.
 *
 * ## Erro de tool não derruba o turno
 *
 * Uma tool que falha volta como conteúdo de mensagem, marcada como erro. O modelo lê que falhou e
 * tenta outra coisa, que é o comportamento útil; abortar transformaria um erro recuperável — um
 * id errado, uma questão sem alternativas — em fim de conversa.
 *
 * A exceção é o provider: se o endpoint cai, não há o que tentar, e o turno termina com o erro
 * registrado.
 *
 * Ver spec §35 · issue #97.
 */

export interface RunTurnInput {
  readonly provider: AiProvider;
  readonly model: string;
  /** Define o prompt de sistema, o teto de iterações e o relógio. `ASK` por padrão. */
  readonly mode?: AgentMode;
  readonly tools: readonly AgentTool[];
  readonly context: AgentContext;
  readonly prompt: string;
  /**
   * A questão aberta na tela, quando há uma.
   *
   * Sem isto o modelo **inventa id** — e inventa com convicção: numa verificação contra o Ollama
   * real ele chamou as tools com dois uuids que não existiam e concluiu, a partir do "não
   * encontrei", que a questão não tinha alternativas. A resposta soava perfeitamente plausível.
   *
   * É o critério de aceite da fase: o modelo sabe exatamente qual questão está aberta.
   */
  readonly focusedQuestionId?: string | null;
  /** Turnos anteriores, para o modelo não reler tudo a cada pergunta. */
  readonly history?: readonly AiMessage[];
  /**
   * `false` quando o endpoint não faz tool calling.
   *
   * O turno **degrada** em vez de falhar: sem tools, o agente responde com o que o usuário
   * anexou, e o prompt de sistema diz isso. Recusar seria deixar o modo `ASK` inútil no Ollama,
   * que é o ambiente primário (D21) — e a resposta a partir do contexto anexado ainda é útil.
   */
  readonly toolCalling?: boolean;
  readonly signal?: AbortSignal;
  /** Injetável para teste; em produção é `Date.now`. */
  readonly now?: () => number;
}

export interface RunTurnOutput {
  readonly answer: string;
  readonly record: AgentRunRecord;
  /** As mensagens do turno, para virarem histórico do próximo. */
  readonly messages: readonly AiMessage[];
}

export async function runAgentTurn(input: RunTurnInput): Promise<RunTurnOutput> {
  const now = input.now ?? Date.now;
  const startedAt = now();

  const mode = input.mode ?? "ASK";
  const profile = profileForMode(mode);
  const deadline = startedAt + profile.timeoutMs;

  const byName = new Map(input.tools.map((tool) => [tool.name, tool]));
  const toolCalls: ToolCallRecord[] = [];

  const toolCalling = input.toolCalling ?? true;
  const usableTools = toolCalling ? input.tools : [];

  const contextBlock = renderContext(input.context);
  const messages: AiMessage[] = [
    {
      role: "system",
      // Sem tool calling nativo o prompt do modo não serve: ele manda usar ferramentas que não
      // existem naquele endpoint, e o modelo passa a prometer consultas que nunca faz.
      content: toolCalling ? profile.systemPrompt : ASK_SYSTEM_PROMPT_NO_TOOLS,
    },
    ...(input.history ?? []),
    // O contexto vai **antes** da pergunta, numa mensagem própria: misturado ao prompt, o modelo
    // trata enunciado colado como se fosse instrução do usuário, e passa a obedecer o que está
    // escrito dentro da questão.
    ...(input.focusedQuestionId
      ? [
          {
            role: "system" as const,
            content:
              `A questão aberta na tela agora é \`${input.focusedQuestionId}\`. ` +
              "Use exatamente este id nas ferramentas. Não invente id nem use id de exemplo.",
          },
        ]
      : []),
    ...(contextBlock === ""
      ? []
      : [{ role: "user" as const, content: `Contexto anexado:\n\n${contextBlock}` }]),
    { role: "user", content: input.prompt },
  ];

  const base = {
    model: input.model,
    // Lista vazia vira **ausência** de `tools` na requisição: alguns endpoints recusam um array
    // vazio, e mandar o campo sem conteúdo não comunica nada de qualquer forma.
    ...(usableTools.length === 0
      ? {}
      : {
          tools: usableTools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        }),
  } satisfies Omit<AgentRequest, "messages">;

  /**
   * O prazo desta chamada é o que resta do turno.
   *
   * Sem isto o orçamento do modo é decorativo: o provider tem timeout próprio (120 s), e um
   * modelo local de 30B numa conversa longa estoura esse limite antes de o relógio do modo chegar
   * perto. Foi o que aconteceu na primeira verificação do `FIX_LATEX` — o turno morreu em 120,9 s
   * com um orçamento de 300 s.
   *
   * O sinal de quem chamou continua valendo: cancelar a aba precisa cancelar a chamada.
   */
  const signalFor = (): AbortSignal => {
    const remaining = Math.max(1_000, deadline - now());
    const budget = AbortSignal.timeout(remaining);
    return input.signal ? AbortSignal.any([input.signal, budget]) : budget;
  };

  const finish = (
    state: AgentRunRecord["state"],
    answer: string,
    extra: Partial<AgentRunRecord> = {},
  ): RunTurnOutput => ({
    answer,
    messages,
    record: {
      mode,
      providerId: input.provider.id,
      model: input.model,
      state,
      promptSummary: summarize(input.prompt),
      answerSummary: summarize(answer),
      toolCalls,
      durationMs: now() - startedAt,
      ...extra,
    },
  });

  let lastText = "";

  for (let iteration = 0; iteration <= profile.maxIterations; iteration += 1) {
    // O relógio conta o turno inteiro. O teto de iterações conta chamadas, e um modelo local de
    // 30B leva dois minutos por chamada — cinco iterações viram dez minutos de tela parada. Aqui
    // o usuário recebe o que já foi apurado em vez de esperar sem prazo.
    if (iteration > 0 && now() >= deadline) {
      return finish(
        "ABORTED",
        lastText ||
          `O turno passou de ${Math.round(profile.timeoutMs / 1000)} s e foi interrompido. ` +
            "Tente uma pergunta mais específica.",
      );
    }

    /**
     * A última volta vai **sem tools**.
     *
     * Modelo local que se enrosca chama a mesma tool de novo em vez de concluir — visto contra o
     * Ollama real: três rodadas gastas relendo a mesma questão e nenhuma resposta. Tirar as tools
     * da última chamada obriga a responder com o que já foi lido, que é o que o usuário queria
     * desde o começo. Sem isso, o teto protege o bolso e entrega uma desculpa.
     */
    const lastRound = iteration === profile.maxIterations;
    const request = { ...(lastRound ? withoutTools(base) : base), signal: signalFor() };

    let result;
    try {
      result = await input.provider.run({ ...request, messages });
    } catch (problem) {
      // Estourar o **nosso** prazo não é o endpoint falhar, e chamar os dois de `FAILED` diria ao
      // usuário que a IA quebrou quando o que houve foi demora. Na verificação do `FIX_LATEX` o
      // turno bateu no orçamento e foi registrado como falha de provider — o que mandaria alguém
      // investigar o Ollama em vez de fazer uma pergunta menor.
      if (now() >= deadline) {
        return finish(
          "ABORTED",
          lastText ||
            `O turno passou de ${Math.round(profile.timeoutMs / 1000)} s e foi interrompido. ` +
              "Tente uma pergunta mais específica, ou um modelo mais rápido.",
        );
      }

      // Sem endpoint não há o que tentar. O erro fica registrado e a edição do usuário na tela
      // não é tocada — o turno falha, o app não.
      const message = problem instanceof Error ? problem.message : "Falha ao falar com o provider.";
      return finish("FAILED", "", { error: summarize(message) });
    }

    lastText = result.text;

    if (result.toolCalls.length === 0) {
      return finish("DONE", result.text, {
        ...(result.usage?.inputTokens === undefined
          ? {}
          : { inputTokens: result.usage.inputTokens }),
        ...(result.usage?.outputTokens === undefined
          ? {}
          : { outputTokens: result.usage.outputTokens }),
      });
    }

    // Sem tools na última volta, chegar aqui significa que o endpoint devolveu tool call mesmo
    // assim — acontece com endpoint compatível malcomportado. O texto que houver vale mais que
    // uma quarta rodada.
    if (lastRound) {
      return finish(
        "DONE",
        result.text ||
          `Consultei o que dava em ${profile.maxIterations} rodadas e ainda não cheguei a uma ` +
            "resposta. Tente uma pergunta mais específica, ou anexe o que falta.",
      );
    }

    messages.push({ role: "assistant", content: result.text });

    for (const call of result.toolCalls) {
      messages.push({ role: "tool", result: await executeCall(call, byName, toolCalls, now) });
    }
  }

  return finish("DONE", lastText);
}

/** A mesma requisição, sem o campo `tools` — não com uma lista vazia. */
function withoutTools(base: Omit<AgentRequest, "messages">): Omit<AgentRequest, "messages"> {
  const { tools: _ignored, ...rest } = base;
  return rest;
}

async function executeCall(
  call: AiToolCall,
  byName: Map<string, AgentTool>,
  log: ToolCallRecord[],
  now: () => number,
) {
  const startedAt = now();
  const tool = byName.get(call.name);

  const record = (status: "ok" | "error", outputChars: number, error?: string): void => {
    log.push({
      name: call.name,
      inputSummary: summarizeToolInput(call.input),
      outputChars,
      durationMs: now() - startedAt,
      status,
      ...(error === undefined ? {} : { error }),
    });
  };

  if (!tool) {
    // Modelo inventa nome de tool. Dizer quais existem é melhor que um erro genérico — ele
    // costuma acertar na tentativa seguinte.
    const output = `Não existe a ferramenta \`${call.name}\`. Disponíveis: ${[...byName.keys()].join(", ")}.`;
    record("error", output.length, "tool inexistente");
    return { toolCallId: call.id, output, isError: true };
  }

  try {
    const output = await tool.execute(call.input);
    record("ok", output.length);
    return { toolCallId: call.id, output };
  } catch (problem) {
    const message =
      problem instanceof ToolInputError
        ? problem.message
        : problem instanceof Error
          ? problem.message
          : "Falha ao executar a ferramenta.";

    record("error", message.length, summarize(message, 120));
    return { toolCallId: call.id, output: message, isError: true };
  }
}

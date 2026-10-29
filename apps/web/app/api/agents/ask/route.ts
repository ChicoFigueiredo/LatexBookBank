import { NextResponse } from "next/server";

import { askAgent } from "@modules/agents/application/ask-agent";
import {
  EMPTY_CONTEXT,
  type AgentContext,
  type ContextItem,
} from "@modules/agents/domain/agent-context";
import { isAgentMode } from "@modules/agents/domain/agent-mode";
import type { AgentMode } from "@modules/agents/domain/agent-run";
import { questionRenderSource } from "@modules/rendering/infrastructure/prisma-question-render-source";
import { renderWiringFromEnv } from "@modules/rendering/infrastructure/render-wiring";
import { PrismaAgentReadPort } from "@infrastructure/agent/prisma-agent-read-port";
import { recordAgentRun, workspaceOfQuestion } from "@infrastructure/agent/prisma-agent-run-writer";
import { readQuestionState } from "@infrastructure/agent/prisma-question-state";
import { aiProvider } from "@infrastructure/composition";
import { env as appEnv } from "@/shared/config/env";

import { BadRequestError, readJson, toErrorResponse } from "../../http";

/**
 * Um turno do agente, modo `ASK`.
 *
 * O Route Handler só traduz HTTP: confere a configuração, lê o pedido, entrega ao caso de uso
 * (`askAgent`) as portas que a raiz de composição monta, e devolve a resposta. A chave nunca sai deste lado — o cliente manda a
 * pergunta e o contexto que ele mesmo montou, e recebe texto de volta.
 *
 * O contexto vem do cliente de propósito, e não é uma brecha: ele contém o que o usuário anexou
 * na barra, que ele já está vendo. Deixar o servidor decidir o que anexar seria justamente o
 * agente que lê o que quer — o oposto do contexto explícito. O que o servidor protege é o teto de
 * tamanho e o fato de que só as sete tools de leitura existem.
 *
 * Ver spec §14.6 · §35 · issue #97.
 */
export const dynamic = "force-dynamic";

const MAX_PROMPT_CHARS = 4_000;
const MAX_CONTEXT_ITEMS = 20;
const MAX_CONTEXT_CHARS = 60_000;

export async function POST(request: Request) {
  try {
    const env = appEnv();

    if (env.aiBaseUrl === null) {
      // Não configurado é diferente de fora do ar, e a mensagem precisa dizer qual dos dois.
      return NextResponse.json(
        {
          error: "ai_not_configured",
          message:
            "`AI_BASE_URL` não está definido. Aponte para o OpenRouter, o OpenAI ou o Ollama " +
            "local em `apps/web/.env.local`.",
        },
        { status: 503 },
      );
    }
    if (env.aiModel === null) {
      return NextResponse.json(
        {
          error: "ai_model_missing",
          message: "`AI_MODEL` não está definido — escolha o modelo em `apps/web/.env.local`.",
        },
        { status: 503 },
      );
    }

    const body = await readJson(request);

    const prompt = parsePrompt(body["prompt"]);
    const context = parseContext(body["context"]);
    const questionId = parseOptionalId(body["questionId"]);
    const mode = parseMode(body["mode"]);

    // `AI_TOOL_CALLING=true` corrige o perfil quando o modelo sabe mais do que ele assume —
    // `qwen3-coder:30b` no Ollama, por exemplo. A regra é a mesma que o /diagnostico mostra.
    const provider = aiProvider();
    // Inalcançável: a fábrica só devolve `null` sem `AI_BASE_URL`, e isso foi conferido acima.
    if (provider === null) throw new Error("AI_BASE_URL conferido acima, e a fábrica não o viu.");
    // Sem worker configurado o app funciona — a Fase 6 já trata "não configurado" como estado
    // legítimo, e o agente simplesmente não ganha a tool de compilar.
    const render = renderWiringFromEnv();

    const outcome = await askAgent(
      {
        provider,
        model: env.aiModel,
        readPort: new PrismaAgentReadPort(),
        questionState: readQuestionState,
        render:
          render === null
            ? null
            : {
                executor: render.executor,
                loadSource: (id) => questionRenderSource(id, render.storage),
              },
        runLog: { workspaceOf: workspaceOfQuestion, record: recordAgentRun },
        // Engolir em silêncio esconderia auditoria que deixou de existir. Vai para o log do
        // servidor e a resposta segue: o usuário não perde o que já tem por causa disto.
        onRecordFailure: (problem) =>
          console.error("[agents] falha ao registrar AgentRun:", problem),
      },
      { prompt, context, questionId, mode },
    );

    return NextResponse.json({
      answer: outcome.answer,
      proposals: outcome.proposals,
      state: outcome.record.state,
      toolCalls: outcome.record.toolCalls,
      usage: {
        inputTokens: outcome.record.inputTokens ?? null,
        outputTokens: outcome.record.outputTokens ?? null,
      },
      durationMs: outcome.record.durationMs,
      error: outcome.record.error ?? null,
      runId: outcome.runId,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** `ASK` é o default: ganhar tools de proposta precisa ser pedido, não herdado. */
function parseMode(value: unknown): AgentMode {
  if (value === undefined || value === null) return "ASK";
  if (typeof value === "string" && isAgentMode(value)) return value;

  throw new BadRequestError("`mode` precisa ser ASK, REVIEW, FIX_LATEX, ENRICH ou STRUCTURE.");
}

function parsePrompt(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError("`prompt` é obrigatório.");
  }
  if (value.length > MAX_PROMPT_CHARS) {
    throw new BadRequestError(`\`prompt\` passa de ${MAX_PROMPT_CHARS} caracteres.`);
  }
  return value.trim();
}

function parseOptionalId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > 200) {
    throw new BadRequestError("`questionId` precisa ser um identificador.");
  }
  return value;
}

/**
 * O contexto vem do cliente, e o servidor confere o tamanho.
 *
 * O teto existe no domínio e é aplicado na tela, mas a tela é só um dos caminhos até aqui: uma
 * requisição montada à mão passaria por fora dela. Repetir a checagem é barato e fecha a porta.
 */
function parseContext(value: unknown): AgentContext {
  if (value === undefined || value === null) return EMPTY_CONTEXT;
  if (!Array.isArray(value)) throw new BadRequestError("`context` precisa ser uma lista.");
  if (value.length > MAX_CONTEXT_ITEMS) {
    throw new BadRequestError(`\`context\` passa de ${MAX_CONTEXT_ITEMS} itens.`);
  }

  let total = 0;
  const items: ContextItem[] = value.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new BadRequestError(`\`context[${index}]\` precisa ser um objeto.`);
    }
    const record = entry as Record<string, unknown>;

    const label = typeof record["label"] === "string" ? record["label"] : null;
    const content = typeof record["content"] === "string" ? record["content"] : null;
    if (label === null || content === null) {
      throw new BadRequestError(`\`context[${index}]\` precisa ter \`label\` e \`content\`.`);
    }

    total += content.length;
    if (total > MAX_CONTEXT_CHARS) {
      throw new BadRequestError(`\`context\` passa de ${MAX_CONTEXT_CHARS} caracteres.`);
    }

    return {
      id: typeof record["id"] === "string" ? record["id"] : `ctx-${index}`,
      // O `kind` só rotula a saída para o modelo; um valor desconhecido não justifica recusar a
      // pergunta inteira.
      kind: "question",
      label: label.slice(0, 120),
      content,
      explicit: true,
    };
  });

  return { items };
}

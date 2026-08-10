import { NextResponse } from "next/server";

import { runAgentTurn } from "@modules/agents/application/run-agent-turn";
import { buildAgentTools } from "@modules/agents/application/build-agent-tools";
import {
  buildProposeTools,
  createPatchCollector,
} from "@modules/agents/application/build-propose-tools";
import { buildCandidateRenderTool } from "@modules/agents/application/render-candidate";
import { diffPatch } from "@modules/agents/domain/patch-diff";
import { QUESTION_PREVIEW_PROFILE } from "@modules/rendering/domain/latex-profile";
import { loadQuestionForRender } from "@modules/rendering/infrastructure/prisma-question-render-source";
import { RenderWorkerExecutor } from "@modules/rendering/infrastructure/render-worker-executor";
import { readQuestionState } from "@infrastructure/agent/prisma-question-state";
import {
  EMPTY_CONTEXT,
  type AgentContext,
  type ContextItem,
} from "@modules/agents/domain/agent-context";
import { OpenAiCompatibleProvider } from "@modules/agents/infrastructure/openai-compatible-provider";
import { PrismaAgentReadPort } from "@infrastructure/agent/prisma-agent-read-port";
import { recordAgentRun, workspaceOfQuestion } from "@infrastructure/agent/prisma-agent-run-writer";
import { env as appEnv } from "@/shared/config/env";
import { AiCredentialMissingError, type RenderExecutor } from "@/shared/ports";

import { BadRequestError, readJson, toErrorResponse } from "../../tree-http";

/**
 * Um turno do agente, modo `ASK`.
 *
 * O Route Handler só traduz HTTP: monta o provider a partir do ambiente, entrega as tools que o
 * **servidor** define e chama o caso de uso. A chave nunca sai deste lado — o cliente manda a
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

    const provider = new OpenAiCompatibleProvider({
      baseUrl: env.aiBaseUrl,
      apiKey: env.aiApiKey,
      // `AI_TOOL_CALLING=true` corrige o perfil quando o modelo sabe mais do que ele assume —
      // `qwen3-coder:30b` no Ollama, por exemplo.
      ...(env.aiToolCalling ? { capabilities: { toolCalling: true } } : {}),
    });

    // No modo `REVIEW` o agente ganha as tools de proposta — que **não** escrevem: elas guardam o
    // patch numa bandeja para o humano revisar. A escrita continua sendo um gesto do usuário, por
    // outra rota, com a lista de linhas aprovadas.
    const collector = createPatchCollector();
    const executor = candidateExecutor(env);

    const outcome = await runAgentTurn({
      provider,
      model: env.aiModel,
      // O escopo vem do **servidor**: o modelo não fornece id de questão, e por isso não
      // consegue inventar um.
      tools: [
        ...buildAgentTools(new PrismaAgentReadPort(), { questionId }),
        ...(mode === "REVIEW" ? buildProposeTools(collector) : []),
        // Compilar candidato só faz sentido quando ele pode propor, e só existe com worker
        // configurado — sem ele, oferecer a tool seria prometer o que não se cumpre.
        ...(mode === "REVIEW" && questionId !== null && executor !== null
          ? [
              buildCandidateRenderTool({
                executor,
                profile: QUESTION_PREVIEW_PROFILE,
                loadQuestion: async () =>
                  (await loadQuestionForRender(questionId))?.question ?? null,
              }),
            ]
          : []),
      ],
      context,
      prompt,
      focusedQuestionId: questionId,
      toolCalling: provider.capabilities.toolCalling,
    });

    // O registro é do **app**, não do agente: ele grava que o turno aconteceu, e falhar ao gravar
    // não pode custar ao usuário a resposta que ele já tem. Sem workspace — questão fora de
    // árvore — não há onde ancorar o log, e o turno segue sem ele.
    const workspaceId = questionId === null ? null : await workspaceOfQuestion(questionId);
    let runId: string | null = null;
    if (workspaceId !== null) {
      runId = await recordAgentRun({ workspaceId, questionId }, outcome.record).catch(
        (problem: unknown) => {
          // Engolir em silêncio esconderia auditoria que deixou de existir. Vai para o log do
          // servidor e a resposta segue: o usuário não perde o que já tem por causa disto.
          console.error("[agents] falha ao registrar AgentRun:", problem);
          return null;
        },
      );
    }

    // O diff é calculado aqui: a tela mostra o que **mudaria**, não o que o agente escreveu. Um
    // patch que reescreve o campo com o mesmo texto viraria uma linha de revisão sem conteúdo.
    const state = questionId === null ? null : await readQuestionState(questionId);
    const proposals =
      state === null
        ? []
        : collector.patches.map((patch) => ({
            patch,
            summary: patch.summary,
            warnings: patch.warnings,
            changes: diffPatch(state, patch),
          }));

    return NextResponse.json({
      answer: outcome.answer,
      proposals,
      state: outcome.record.state,
      toolCalls: outcome.record.toolCalls,
      usage: {
        inputTokens: outcome.record.inputTokens ?? null,
        outputTokens: outcome.record.outputTokens ?? null,
      },
      durationMs: outcome.record.durationMs,
      error: outcome.record.error ?? null,
      runId,
    });
  } catch (error) {
    if (error instanceof AiCredentialMissingError) {
      return NextResponse.json(
        { error: "ai_credential_missing", message: error.message },
        { status: 503 },
      );
    }
    return toErrorResponse(error);
  }
}

/**
 * O executor de render, ou `null` quando o worker não está configurado.
 *
 * O app funciona sem ele — a Fase 6 já trata "não configurado" como estado legítimo, e o agente
 * simplesmente não ganha a tool de compilar.
 */
function candidateExecutor(env: ReturnType<typeof appEnv>): RenderExecutor | null {
  if (env.rendererBaseUrl === null || env.rendererSecret === null) return null;

  return new RenderWorkerExecutor({
    baseUrl: env.rendererBaseUrl,
    secret: env.rendererSecret,
  });
}

/** `ASK` é o default: ganhar tools de escrita precisa ser pedido, não herdado. */
function parseMode(value: unknown): "ASK" | "REVIEW" {
  if (value === undefined || value === null || value === "ASK") return "ASK";
  if (value === "REVIEW") return "REVIEW";
  throw new BadRequestError("`mode` precisa ser `ASK` ou `REVIEW`.");
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

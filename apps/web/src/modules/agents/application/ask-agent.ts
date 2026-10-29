import { QUESTION_PREVIEW_PROFILE } from "@modules/rendering/domain/latex-profile";
import type { RenderSource } from "@modules/rendering/domain/render-source";
import type { AiModelCapabilities, AiProvider, RenderExecutor } from "@/shared/ports";

import type { AgentContext } from "../domain/agent-context";
import { profileForMode } from "../domain/agent-mode";
import type { AgentMode, AgentRunRecord } from "../domain/agent-run";
import { diffPatch, type Change, type QuestionState } from "../domain/patch-diff";
import type { QuestionPatch } from "../domain/question-patch";
import type { AgentReadPort } from "./agent-read-port";
import { buildAgentTools } from "./build-agent-tools";
import { buildProposeTools, createPatchCollector } from "./build-propose-tools";
import { buildCandidateRenderTool } from "./render-candidate";
import { runAgentTurn } from "./run-agent-turn";

/**
 * Um turno do agente, do pedido à resposta com as propostas e o registro.
 *
 * Morava inteiro na rota (ARQ-09): ela escolhia as tools pelo modo, gravava o `AgentRun` com
 * política própria e calculava o diff. Um segundo canal — um script de lote, uma revisão
 * automática, uma rota de streaming — teria de copiar tudo, e a cópia esqueceria a regra de só
 * oferecer render com questão em foco, ou a de não derrubar o turno quando o registro falha.
 *
 * O caso de uso recebe as portas prontas e não lê ambiente: qual endpoint, qual modelo e se há
 * worker de render é da raiz de composição.
 *
 * Ver spec §14.6 · §35 · issue #97.
 */

export interface AskAgentDeps {
  /** O endpoint, com o que ele sabe fazer: sem tool calling o turno degrada em vez de falhar. */
  readonly provider: AiProvider & {
    readonly capabilities: Pick<AiModelCapabilities, "toolCalling">;
  };
  readonly model: string;
  /** As tools de leitura: o escopo vem do servidor, e o modelo não consegue inventar id. */
  readonly readPort: AgentReadPort;
  /** O estado da questão em foco: o tipo dela limita o gabarito, e o diff parte dele. */
  readonly questionState: (questionId: string) => Promise<QuestionState | null>;
  /** O worker de render, quando configurado; sem ele o agente não ganha a tool de compilar. */
  readonly render: {
    readonly executor: RenderExecutor;
    readonly loadSource: (questionId: string) => Promise<RenderSource | null>;
  } | null;
  readonly runLog: {
    workspaceOf(questionId: string): Promise<string | null>;
    record(
      origin: { readonly workspaceId: string; readonly questionId: string | null },
      record: AgentRunRecord,
    ): Promise<string>;
  };
  /** Onde avisar que o registro falhou — o turno segue, mas a auditoria perdida não some calada. */
  readonly onRecordFailure?: (problem: unknown) => void;
}

export interface AskAgentCommand {
  readonly prompt: string;
  readonly context: AgentContext;
  readonly questionId: string | null;
  readonly mode: AgentMode;
}

export interface AgentProposal {
  readonly patch: QuestionPatch;
  readonly summary: QuestionPatch["summary"];
  readonly warnings: QuestionPatch["warnings"];
  /** O que **mudaria** — e não o que o agente escreveu. */
  readonly changes: readonly Change[];
}

export interface AskAgentOutcome {
  readonly answer: string;
  readonly proposals: readonly AgentProposal[];
  readonly record: AgentRunRecord;
  /** `null` sem questão em foco (não há workspace onde ancorar) ou quando o registro falhou. */
  readonly runId: string | null;
}

export async function askAgent(
  deps: AskAgentDeps,
  command: AskAgentCommand,
): Promise<AskAgentOutcome> {
  const { questionId, mode } = command;

  // No modo `REVIEW` o agente ganha as tools de proposta — que **não** escrevem: elas guardam o
  // patch numa bandeja para o humano revisar. A escrita continua sendo um gesto do usuário, por
  // outra rota, com a lista de linhas aprovadas.
  const collector = createPatchCollector();
  // Quais tools o modo dá — a lista vem do perfil, não de um `if` por modo espalhado aqui.
  const toolSet = profileForMode(mode).tools;
  // O tipo decide quantas corretas uma proposta de gabarito pode marcar.
  const questionType =
    toolSet === "read" || questionId === null
      ? null
      : ((await deps.questionState(questionId))?.type ?? null);
  const render = deps.render;

  const outcome = await runAgentTurn({
    provider: deps.provider,
    model: deps.model,
    tools: [
      ...buildAgentTools(deps.readPort, { questionId }),
      ...(toolSet === "read" ? [] : buildProposeTools(collector, { questionType })),
      // Compilar candidato só faz sentido quando ele pode propor, e só existe com worker
      // configurado — sem ele, oferecer a tool seria prometer o que não se cumpre.
      ...(toolSet === "read+propose+render" && questionId !== null && render !== null
        ? [
            buildCandidateRenderTool({
              executor: render.executor,
              profile: QUESTION_PREVIEW_PROFILE,
              // A questão com as figuras dela: o candidato compila como o editor compila.
              loadSource: () => render.loadSource(questionId),
            }),
          ]
        : []),
    ],
    context: command.context,
    prompt: command.prompt,
    mode,
    focusedQuestionId: questionId,
    toolCalling: deps.provider.capabilities.toolCalling,
  });

  // O registro é do **app**, não do agente: ele grava que o turno aconteceu, e falhar ao gravar
  // não pode custar ao usuário a resposta que ele já tem. Sem workspace — questão fora de
  // árvore — não há onde ancorar o log, e o turno segue sem ele.
  const workspaceId = questionId === null ? null : await deps.runLog.workspaceOf(questionId);
  let runId: string | null = null;
  if (workspaceId !== null) {
    runId = await deps.runLog
      .record({ workspaceId, questionId }, outcome.record)
      .catch((problem: unknown) => {
        deps.onRecordFailure?.(problem);
        return null;
      });
  }

  // O diff parte do estado **depois** do turno: a tela mostra o que mudaria, não o que o agente
  // escreveu. Um patch que reescreve o campo com o mesmo texto viraria uma linha sem conteúdo.
  const state = questionId === null ? null : await deps.questionState(questionId);
  const proposals =
    state === null
      ? []
      : collector.patches.map((patch) => ({
          patch,
          summary: patch.summary,
          warnings: patch.warnings,
          changes: diffPatch(state, patch),
        }));

  return { answer: outcome.answer, proposals, record: outcome.record, runId };
}

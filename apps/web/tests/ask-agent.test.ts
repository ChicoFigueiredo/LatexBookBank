import { describe, expect, it } from "vitest";

import { askAgent, type AskAgentDeps } from "@modules/agents/application/ask-agent";
import type { AgentReadPort } from "@modules/agents/application/agent-read-port";
import { EMPTY_CONTEXT } from "@modules/agents/domain/agent-context";
import type { AgentMode } from "@modules/agents/domain/agent-run";
import type { AgentRequest, AgentResult, RenderExecutor } from "@/shared/ports";

/**
 * O turno do agente como caso de uso (ARQ-09), sem rota, sem banco e sem rede.
 *
 * As duas regras que uma cópia da orquestração esqueceria: a tool de compilar só existe com
 * worker e questão em foco, no modo que compila; e uma falha ao registrar a execução não custa a
 * resposta que a pessoa já tem.
 */

function deps(over: Partial<AskAgentDeps> = {}) {
  const requests: AgentRequest[] = [];
  const failures: unknown[] = [];
  const base: AskAgentDeps = {
    provider: {
      id: "fake",
      capabilities: { toolCalling: true },
      listModels: async () => [],
      run: async (request): Promise<AgentResult> => {
        requests.push(request);
        return { text: "pronto", toolCalls: [] };
      },
    },
    model: "m",
    readPort: {} as AgentReadPort,
    questionState: async () => null,
    render: { executor: {} as RenderExecutor, loadSource: async () => null },
    runLog: { workspaceOf: async () => "w1", record: async () => "run-1" },
    onRecordFailure: (problem) => failures.push(problem),
    ...over,
  };
  return { deps: base, requests, failures };
}

const toolNames = (request: AgentRequest | undefined) =>
  (request?.tools ?? []).map((tool) => tool.name);

const pedir = (d: AskAgentDeps, mode: AgentMode, questionId: string | null = "q1") =>
  askAgent(d, { prompt: "Oi", context: EMPTY_CONTEXT, questionId, mode });

describe("askAgent", () => {
  it("a tool de compilar só aparece no modo que compila, com questão em foco e worker", async () => {
    const comTudo = deps();
    await pedir(comTudo.deps, "FIX_LATEX");
    expect(toolNames(comTudo.requests[0])).toContain("render_candidate_latex");

    const semWorker = deps({ render: null });
    await pedir(semWorker.deps, "FIX_LATEX");
    expect(toolNames(semWorker.requests[0])).not.toContain("render_candidate_latex");

    const semFoco = deps();
    await pedir(semFoco.deps, "FIX_LATEX", null);
    expect(toolNames(semFoco.requests[0])).not.toContain("render_candidate_latex");

    const soLeitura = deps();
    await pedir(soLeitura.deps, "ASK");
    expect(toolNames(soLeitura.requests[0])).not.toContain("render_candidate_latex");
  });

  it("registra a execução no workspace da questão e devolve o id", async () => {
    const { deps: d } = deps();

    expect(await pedir(d, "ASK")).toMatchObject({ answer: "pronto", runId: "run-1" });
  });

  it("falhar ao registrar não custa a resposta, e a falha é avisada", async () => {
    const problema = new Error("SQLITE_BUSY");
    const { deps: d, failures } = deps({
      runLog: {
        workspaceOf: async () => "w1",
        record: async () => {
          throw problema;
        },
      },
    });

    expect(await pedir(d, "ASK")).toMatchObject({ answer: "pronto", runId: null });
    expect(failures).toEqual([problema]);
  });

  it("sem questão em foco, não há onde ancorar o registro", async () => {
    let gravou = false;
    const { deps: d } = deps({
      runLog: {
        workspaceOf: async () => "w1",
        record: async () => {
          gravou = true;
          return "run-1";
        },
      },
    });

    expect(await pedir(d, "ASK", null)).toMatchObject({ runId: null });
    expect(gravou).toBe(false);
  });
});

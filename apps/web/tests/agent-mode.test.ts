import { describe, expect, it } from "vitest";

import { isAgentMode, MODE_PROFILES, profileForMode } from "@modules/agents/domain/agent-mode";
import { AGENT_MODES } from "@modules/agents/domain/agent-run";
import { runAgentTurn } from "@modules/agents/application/run-agent-turn";
import { EMPTY_CONTEXT } from "@modules/agents/domain/agent-context";
import type { AgentTool } from "@modules/agents/domain/tool-contract";
import type { AgentResult, AiProvider } from "@/shared/ports";

/**
 * Um modo é um conjunto de tools, um teto de iterações e um critério de parada — não um prompt
 * diferente. Sem teto próprio e sem relógio, "tentar até compilar" e "ficar preso" são a mesma
 * coisa vista de fora.
 */

describe("os cinco modos", () => {
  it("todo modo declarado tem perfil", () => {
    for (const mode of AGENT_MODES) {
      expect(profileForMode(mode).id).toBe(mode);
    }
    expect(Object.keys(MODE_PROFILES)).toHaveLength(AGENT_MODES.length);
  });

  it("`ASK` não ganha tool de proposta", () => {
    // Ganhar poder de propor precisa ser pedido, não herdado.
    expect(MODE_PROFILES.ASK.tools).toBe("read");
  });

  it("só `FIX_LATEX` compila candidato", () => {
    // Compilar é caro em segundos; dar a tool a quem não precisa dela é convidar o gasto.
    const withRender = AGENT_MODES.filter(
      (mode) => MODE_PROFILES[mode].tools === "read+propose+render",
    );
    expect(withRender).toEqual(["FIX_LATEX"]);
  });

  it("`FIX_LATEX` tem mais iterações — o ciclo dele gasta duas por tentativa", () => {
    expect(MODE_PROFILES.FIX_LATEX.maxIterations).toBeGreaterThan(MODE_PROFILES.ASK.maxIterations);
  });

  it("todo modo tem relógio, e nenhum passa de dez minutos", () => {
    // O teto existe para o turno ter fim. Dez minutos é o que um modelo local de 30B precisa para
    // o ciclo do `FIX_LATEX` — medido, não estimado —, e é o máximo que faz sentido esperar com a
    // tela parada.
    for (const mode of AGENT_MODES) {
      const profile = MODE_PROFILES[mode];
      expect(profile.timeoutMs).toBeGreaterThan(0);
      expect(profile.timeoutMs).toBeLessThanOrEqual(600_000);
    }
  });

  it("modo desconhecido não vira modo", () => {
    expect(isAgentMode("APAGAR_TUDO")).toBe(false);
    expect(isAgentMode("REVIEW")).toBe(true);
  });
});

describe("o que cada prompt diz", () => {
  it("`REVIEW` enumera os seis critérios da §36", () => {
    // Sem a lista, o modelo revisa o que primeiro chama a atenção — quase sempre a redação — e
    // passa por cima do gabarito, que é o defeito que de fato inutiliza uma questão.
    const prompt = MODE_PROFILES.REVIEW.systemPrompt;

    for (const criterion of [
      "Sintaxe",
      "Formatação",
      "Estrutura",
      "Gabarito",
      "Metadados",
      "Origem",
    ]) {
      expect(prompt).toContain(criterion);
    }
  });

  it("`FIX_LATEX` proíbe propor o que não foi compilado", () => {
    expect(MODE_PROFILES.FIX_LATEX.systemPrompt).toMatch(/não compilou/i);
  });

  it("`ENRICH` proíbe inventar banca e ano", () => {
    // Metade do acervo é de livro; metadado inventado é pior que campo vazio, porque some da
    // lista de pendências.
    expect(MODE_PROFILES.ENRICH.systemPrompt).toMatch(/não invente/i);
    expect(MODE_PROFILES.ENRICH.systemPrompt).toMatch(/warnings/);
  });

  it("`STRUCTURE` manda descartar a letra do original", () => {
    // Trazer "a)" junto do texto reintroduz o erro que a estrutura existe para evitar.
    // `\s+` e não espaço: o prompt é montado por linhas, e a frase atravessa a quebra.
    expect(MODE_PROFILES.STRUCTURE.systemPrompt).toMatch(/letra\s+é projeção da posição/);
  });

  it("todo modo com proposta diz que não escreve", () => {
    for (const mode of AGENT_MODES) {
      if (MODE_PROFILES[mode].tools === "read") continue;
      expect(MODE_PROFILES[mode].systemPrompt).toMatch(/não\*\* escreve|não escreve/);
    }
  });
});

/** Provider que sempre pede tool — o modelo enroscado que o teto existe para conter. */
class LoopingProvider implements AiProvider {
  readonly id = "ollama";
  calls = 0;

  listModels = () => Promise.resolve([]);

  run = (): Promise<AgentResult> => {
    this.calls += 1;
    return Promise.resolve({
      text: "",
      toolCalls: [{ id: "c", name: "t", input: {} }],
      stopReason: "tool_use",
    });
  };
}

const tool: AgentTool = {
  name: "t",
  description: "Ferramenta de teste com descrição suficientemente longa.",
  inputSchema: { type: "object", additionalProperties: false },
  execute: () => Promise.resolve("ok"),
};

describe("o relógio do turno", () => {
  it("interrompe quando o tempo estoura, mesmo com iterações sobrando", async () => {
    // O teto conta chamadas, não tempo: um modelo de 30B leva dois minutos por chamada, e cinco
    // iterações viram dez minutos com a tela parada.
    let clock = 0;
    const provider = new LoopingProvider();

    const out = await runAgentTurn({
      provider,
      model: "m",
      mode: "FIX_LATEX",
      tools: [tool],
      context: EMPTY_CONTEXT,
      prompt: "conserta",
      // Cada leitura avança um minuto: o relógio estoura antes das seis iterações.
      now: () => (clock += 60_000),
    });

    expect(out.record.state).toBe("ABORTED");
    expect(provider.calls).toBeLessThan(MODE_PROFILES.FIX_LATEX.maxIterations);
    expect(out.answer).toMatch(/interrompido/);
  });

  it("o teto de iterações continua valendo quando o tempo não estoura", async () => {
    const provider = new LoopingProvider();

    const out = await runAgentTurn({
      provider,
      model: "m",
      mode: "ASK",
      tools: [tool],
      context: EMPTY_CONTEXT,
      prompt: "oi",
      now: () => 1_000,
    });

    expect(provider.calls).toBe(MODE_PROFILES.ASK.maxIterations + 1);
    expect(out.record.state).toBe("DONE");
  });

  it("o modo escolhe o prompt de sistema", async () => {
    const seen: string[] = [];
    const provider: AiProvider = {
      id: "ollama",
      listModels: () => Promise.resolve([]),
      run: (request) => {
        const first = request.messages[0];
        if (first && first.role === "system") seen.push(first.content);
        return Promise.resolve({ text: "pronto", toolCalls: [], stopReason: "end" });
      },
    };

    await runAgentTurn({
      provider,
      model: "m",
      mode: "ENRICH",
      tools: [tool],
      context: EMPTY_CONTEXT,
      prompt: "completa",
      now: () => 1_000,
    });

    expect(seen[0]).toBe(MODE_PROFILES.ENRICH.systemPrompt);
  });

  it("cada chamada carrega o prazo restante do turno", async () => {
    // Sem isto o orçamento do modo é decorativo: o provider tem timeout próprio de 120 s, e um
    // modelo local de 30B estoura esse limite antes de o relógio do modo chegar perto. Na
    // primeira verificação do `FIX_LATEX`, o turno morreu em 120,9 s com orçamento de 300 s.
    let seen: AbortSignal | undefined;
    const provider: AiProvider = {
      id: "ollama",
      listModels: () => Promise.resolve([]),
      run: (request) => {
        seen = request.signal;
        return Promise.resolve({ text: "ok", toolCalls: [], stopReason: "end" });
      },
    };

    await runAgentTurn({
      provider,
      model: "m",
      mode: "FIX_LATEX",
      tools: [],
      context: EMPTY_CONTEXT,
      prompt: "conserta",
      now: () => 1_000,
    });

    expect(seen).toBeInstanceOf(AbortSignal);
    expect(seen?.aborted).toBe(false);
  });

  it("o modo fica registrado no `AgentRun`", async () => {
    const provider: AiProvider = {
      id: "ollama",
      listModels: () => Promise.resolve([]),
      run: () => Promise.resolve({ text: "ok", toolCalls: [], stopReason: "end" }),
    };

    const out = await runAgentTurn({
      provider,
      model: "m",
      mode: "STRUCTURE",
      tools: [],
      context: EMPTY_CONTEXT,
      prompt: "estrutura isto",
      now: () => 1_000,
    });

    expect(out.record.mode).toBe("STRUCTURE");
  });
});

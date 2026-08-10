import { describe, expect, it, vi } from "vitest";

import {
  buildCandidateRenderTool,
  formatOutcome,
  MAX_CANDIDATE_RENDERS,
} from "@modules/agents/application/render-candidate";
import { QUESTION_PREVIEW_PROFILE } from "@modules/rendering/domain/latex-profile";
import type { QuestionForRender } from "@modules/rendering/domain/build-render-bundle";
import type { RenderExecutor } from "@/shared/ports";

/**
 * Compilar para conferir **não é** compilar para guardar.
 *
 * O caminho normal grava `RenderJob` e sobe artefatos. Fazer isso a cada tentativa do agente
 * encheria o banco de compilações que ninguém abre duas vezes — e daria a ele um caminho de
 * escrita por via indireta.
 */

const question: QuestionForRender = {
  id: "q-1",
  statementLatex: "Qual é a taxa?",
  solutionLatex: "",
  complementLatex: "",
  options: [{ statementLatex: "1\\%", isCorrect: true }],
};

function fakeExecutor(over: Partial<{ success: boolean; diagnostics: unknown[] }> = {}) {
  const calls: { sourceLatex: string; assets: unknown }[] = [];

  const executor = {
    render: vi.fn((bundle: { sourceLatex: string }, assets: unknown) => {
      calls.push({ sourceLatex: bundle.sourceLatex, assets });
      return Promise.resolve({
        result: {
          jobId: "candidate-1",
          success: over.success ?? true,
          durationMs: 12,
          diagnostics: over.diagnostics ?? [],
          png: [],
          stdout: "",
          stderr: "",
        },
        artifacts: new Map(),
      });
    }),
  } as unknown as RenderExecutor;

  return { executor, calls };
}

const toolFor = (executor: RenderExecutor, load = () => Promise.resolve(question)) =>
  buildCandidateRenderTool({
    executor,
    profile: QUESTION_PREVIEW_PROFILE,
    loadQuestion: load as () => Promise<QuestionForRender | null>,
  });

describe("nada é persistido", () => {
  it("o executor é usado direto, sem repositório nem storage", async () => {
    // As dependências dizem tudo: não há `jobs` nem `storage` para injetar.
    const { executor, calls } = fakeExecutor();
    await toolFor(executor).execute({ field: "statementLatex", value: "Qual é a taxa à vista?" });

    expect(calls).toHaveLength(1);
  });

  it("os bytes são descartados — só diagnósticos voltam", async () => {
    const { executor } = fakeExecutor({
      diagnostics: [
        { severity: "error", message: "Undefined control sequence", line: 3, file: "main.tex" },
      ],
    });

    const output = await toolFor(executor).execute({
      field: "statementLatex",
      value: "\\naoexiste",
    });

    expect(output).toContain("Undefined control sequence");
    expect(output).not.toContain("PDF");
  });
});

describe("o que é compilado", () => {
  it("a questão inteira, com o campo substituído", async () => {
    // Compilar o trecho sozinho esconderia erro de ambiente aberto num campo e fechado em outro,
    // que é o que costuma quebrar.
    const { executor, calls } = fakeExecutor();
    await toolFor(executor).execute({ field: "statementLatex", value: "NOVO ENUNCIADO" });

    expect(calls[0]?.sourceLatex).toContain("NOVO ENUNCIADO");
    expect(calls[0]?.sourceLatex).toContain("1\\%");
  });

  it("sem assets — o candidato é texto", async () => {
    const { executor, calls } = fakeExecutor();
    await toolFor(executor).execute({ field: "solutionLatex", value: "x" });

    expect((calls[0]?.assets as Map<string, unknown>).size).toBe(0);
  });

  it("campo fora da lista é recusado", async () => {
    const { executor } = fakeExecutor();

    await expect(
      toolFor(executor).execute({ field: "validationStatus", value: "VALID" }),
    ).rejects.toThrow(/statementLatex/);
  });

  it("sem questão aberta, diz isso e não compila", async () => {
    const { executor, calls } = fakeExecutor();
    const tool = toolFor(executor, () => Promise.resolve(null as never));

    expect(await tool.execute({ field: "statementLatex", value: "x" })).toMatch(/Nenhuma questão/);
    expect(calls).toHaveLength(0);
  });
});

describe("o teto de tentativas", () => {
  it("para depois de três compilações no mesmo turno", async () => {
    // Compilar é caro em segundos: um modelo que se enrosca chamaria isto em toda rodada.
    const { executor, calls } = fakeExecutor();
    const tool = toolFor(executor);

    for (let i = 0; i < MAX_CANDIDATE_RENDERS; i += 1) {
      await tool.execute({ field: "statementLatex", value: `tentativa ${i}` });
    }
    const extra = await tool.execute({ field: "statementLatex", value: "quarta" });

    expect(calls).toHaveLength(MAX_CANDIDATE_RENDERS);
    expect(extra).toMatch(/Proponha o que tem/);
  });

  it("o teto é por tool, não global — outro turno recomeça", async () => {
    const { executor, calls } = fakeExecutor();

    await toolFor(executor).execute({ field: "statementLatex", value: "a" });
    await toolFor(executor).execute({ field: "statementLatex", value: "b" });

    expect(calls).toHaveLength(2);
  });
});

describe("o que o agente lê", () => {
  it("sucesso sem diagnóstico diz isso explicitamente", () => {
    // Sem a frase, o modelo conclui que a saída veio truncada e tenta de novo.
    expect(formatOutcome({ success: true, durationMs: 812, diagnostics: [] })).toBe(
      "Compilou em 812 ms. Nenhum erro ou aviso.",
    );
  });

  it("`info` não polui — `Overfull \\hbox` não é problema do agente", () => {
    const output = formatOutcome({
      success: true,
      durationMs: 10,
      diagnostics: [{ severity: "info", message: "Overfull \\hbox", line: null, file: null }],
    });

    expect(output).not.toContain("Overfull");
  });

  it("diagnóstico sem arquivo não imprime `(null)`", () => {
    // O contrato declara `file`/`line` anuláveis; comparar com `undefined` faria a condição valer
    // sempre. O tipo apontou o erro antes de qualquer teste.
    const output = formatOutcome({
      success: false,
      durationMs: 10,
      diagnostics: [{ severity: "error", message: "Emergency stop", file: null, line: null }],
    });

    expect(output).not.toContain("null");
    expect(output).toContain("Emergency stop");
  });

  it("erro traz arquivo e linha quando existem", () => {
    const output = formatOutcome({
      success: false,
      durationMs: 10,
      diagnostics: [
        { severity: "error", message: "Missing $ inserted", file: "main.tex", line: 7 },
      ],
    });

    expect(output).toContain("Não** compilou");
    expect(output).toContain("main.tex:7");
  });
});

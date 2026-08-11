import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { buildAgentTools } from "@modules/agents/application/build-agent-tools";
import type {
  AgentAnchorView,
  AgentMetadataView,
  AgentOptionView,
  AgentQuestionView,
  AgentReadPort,
  AgentRenderView,
  AgentSearchHit,
} from "@modules/agents/application/agent-read-port";
import {
  MAX_TOOL_OUTPUT_CHARS,
  READ_ONLY_TOOL_NAMES,
  ToolInputError,
  truncateOutput,
} from "@modules/agents/domain/tool-contract";
import { registerQuestionType } from "@modules/questions/domain/question-type-plugin";
import "@modules/questions/domain/plugins";

/**
 * As tools do agente — e sobretudo o que elas **não** são.
 *
 * A lista é fechada, os inputs são validados e as saídas têm teto. O teste de guarda no fim é o
 * que impede as três regras negativas de virarem recomendação: um prompt pedindo para não
 * escrever é uma sugestão; uma tool que não existe é uma garantia.
 */

void registerQuestionType;

const question = (over: Partial<AgentQuestionView> = {}): AgentQuestionView => ({
  id: "q-1",
  type: "MULTIPLE_CHOICE",
  nickname: null,
  statementLatex: "Qual é a taxa?",
  solutionLatex: "",
  complementLatex: "",
  status: "DRAFT",
  validationStatus: "UNVALIDATED",
  tags: ["juros"],
  ...over,
});

class FakePort implements AgentReadPort {
  questions = new Map<string, AgentQuestionView>([["q-1", question()]]);
  options: AgentOptionView[] = [
    { id: "o-1", statementLatex: "1%", isCorrect: false },
    { id: "o-2", statementLatex: "2%", isCorrect: true },
  ];
  metadata: AgentMetadataView | null = {
    difficulty: 5,
    difficultyLabel: "Médio",
    year: 2024,
    board: "CESPE / CEBRASPE",
    institution: null,
    role: null,
    roleLevel: null,
    publisher: null,
    videoUrl: null,
  };
  anchor: AgentAnchorView | null = null;
  render: AgentRenderView | null = null;
  hits: AgentSearchHit[] = [];
  lastSearch: { query: string; limit: number } | null = null;

  getQuestion = (id: string) => Promise.resolve(this.questions.get(id) ?? null);
  getOptions = (id: string) =>
    Promise.resolve(this.questions.has(id) ? (this.options as readonly AgentOptionView[]) : []);
  getMetadata = (id: string) => Promise.resolve(this.questions.has(id) ? this.metadata : null);
  getSourceAnchor = () => Promise.resolve(this.anchor);
  getLatestRender = () => Promise.resolve(this.render);
  searchQuestions = (query: string, limit: number) => {
    this.lastSearch = { query, limit };
    return Promise.resolve(this.hits as readonly AgentSearchHit[]);
  };
}

const FOCUS = { questionId: "q-1" } as const;

const toolsOf = (port: AgentReadPort, scope: { questionId: string | null } = FOCUS) => {
  const map = new Map(buildAgentTools(port, scope).map((tool) => [tool.name, tool]));
  return (name: (typeof READ_ONLY_TOOL_NAMES)[number]) => {
    const tool = map.get(name);
    if (!tool) throw new Error(`tool ausente: ${name}`);
    return tool;
  };
};

describe("a lista é fechada e vem do servidor", () => {
  it("expõe exatamente as sete tools declaradas", () => {
    const names = buildAgentTools(new FakePort(), FOCUS).map((tool) => tool.name);

    expect(names).toEqual([...READ_ONLY_TOOL_NAMES]);
    expect(names).toHaveLength(7);
  });

  it("toda tool declara schema de input fechado", () => {
    // `additionalProperties: false` impede o modelo de pendurar campos que ninguém valida.
    for (const tool of buildAgentTools(new FakePort(), FOCUS)) {
      expect(tool.inputSchema["additionalProperties"]).toBe(false);
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });
});

describe("inputs são validados antes de tocar a porta", () => {
  it("o id da questão **não** é parâmetro de tool nenhuma", () => {
    // Numa verificação contra o Ollama real, o modelo inventou três uuids diferentes numa só
    // conversa, recebeu "não encontrei" e concluiu que a questão não tinha alternativas — com a
    // resposta soando perfeitamente plausível. Id que o modelo não fornece é id que ele não erra.
    for (const tool of buildAgentTools(new FakePort(), FOCUS)) {
      if (tool.name === "search_questions") continue;
      expect(tool.inputSchema["properties"]).toEqual({});
    }
  });

  it("a tool age sobre a questão em foco, e o input é ignorado", async () => {
    // Mesmo que o modelo invente um campo, ele não muda o alvo.
    const port = new FakePort();
    const output = await toolsOf(port)("get_current_question").execute({ questionId: "outra" });

    expect(output).toContain("Id: q-1");
  });

  it("recusa input que não é objeto na tool que **tem** parâmetro", async () => {
    const tool = toolsOf(new FakePort())("search_questions");
    await expect(tool.execute("juros")).rejects.toThrow(ToolInputError);
  });

  it("recusa busca sem `query`", async () => {
    const tool = toolsOf(new FakePort())("search_questions");
    await expect(tool.execute({})).rejects.toThrow(/obrigatório/);
  });

  it("aceita número em texto, recusa fração e palavra", async () => {
    // Modelos mandam `"10"` com frequência, e o valor é inequívoco. `10.5` seria arredondado
    // adivinhando; `"dez"` não é número.
    const port = new FakePort();
    const tool = toolsOf(port)("search_questions");

    await tool.execute({ query: "juros", limit: "5" });
    expect(port.lastSearch?.limit).toBe(5);

    await expect(tool.execute({ query: "juros", limit: 10.5 })).rejects.toThrow(/inteiro/);
    await expect(tool.execute({ query: "juros", limit: "dez" })).rejects.toThrow(/inteiro/);
  });

  it("limite fora da faixa é recusado, não aparado em silêncio", async () => {
    const tool = toolsOf(new FakePort())("search_questions");
    await expect(tool.execute({ query: "a", limit: 500 })).rejects.toThrow(/entre 1 e 25/);
  });

  it("sem `limit`, usa o padrão", async () => {
    const port = new FakePort();
    await toolsOf(port)("search_questions").execute({ query: "juros" });
    expect(port.lastSearch?.limit).toBe(10);
  });
});

describe("o que as tools respondem", () => {
  it("a letra da alternativa vem da posição, nunca do banco", async () => {
    // D9/§8.5 — guardar a letra na linha é o que quebrava o gabarito ao embaralhar no legado.
    const output = await toolsOf(new FakePort())("get_question_options").execute({
      questionId: "q-1",
    });

    expect(output).toContain("a)");
    expect(output).toContain("b) ✓ correta");
  });

  it("sem questão aberta, diz isso em vez de estourar", async () => {
    // Acontece quando o usuário está num nó estrutural — capítulo, seção.
    const output = await toolsOf(new FakePort(), { questionId: null })(
      "get_current_question",
    ).execute({});

    expect(output).toMatch(/Nenhuma questão está aberta/);
  });

  it("ausência de âncora é resposta legítima, não falha", async () => {
    // Metade do acervo foi digitada, não recortada.
    const output = await toolsOf(new FakePort())("get_source_anchor").execute({
      questionId: "q-1",
    });

    expect(output).toMatch(/não veio de recorte/);
  });

  it("questão nunca compilada diz isso, em vez de listar zero diagnósticos", async () => {
    const output = await toolsOf(new FakePort())("get_render_diagnostics").execute({
      questionId: "q-1",
    });

    expect(output).toMatch(/nunca foi compilada/);
  });

  it("diagnósticos trazem arquivo e linha quando existem", async () => {
    const port = new FakePort();
    port.render = {
      jobId: "job-1",
      state: "FAILED",
      success: false,
      durationMs: 812,
      finishedAt: null,
      diagnostics: [
        { severity: "error", message: "Undefined control sequence", file: "main.tex", line: 12 },
      ],
    };

    const output = await toolsOf(port)("get_render_diagnostics").execute({ questionId: "q-1" });
    expect(output).toContain("main.tex:12");
    expect(output).toContain("Undefined control sequence");
  });

  it("busca vazia responde a ausência, e não uma lista em branco", async () => {
    const output = await toolsOf(new FakePort())("search_questions").execute({ query: "xyz" });
    expect(output).toMatch(/Nenhuma questão/);
  });

  it("validação roda o plugin do tipo e **não** persiste nada", async () => {
    // A porta não tem escrita — se `validate_question` gravasse, o tipo não compilaria.
    const port = new FakePort();
    const output = await toolsOf(port)("validate_question").execute({ questionId: "q-1" });

    expect(output).toMatch(/VALID|INVALID/);
  });

  it("tipo sem plugin não é chamado de inválido", async () => {
    // "Não sei avaliar" não é "está errada".
    const port = new FakePort();
    port.questions.set("q-1", question({ type: "SUM_OF_CORRECT" }));

    const output = await toolsOf(port)("validate_question").execute({ questionId: "q-1" });
    expect(output).toMatch(/não tem plugin|UNVALIDATED/);
  });
});

describe("toda saída tem teto", () => {
  it("trunca marcando o corte", () => {
    // Truncar em silêncio faz o modelo concluir a partir de metade da evidência, e a resposta
    // continua soando completa.
    const output = truncateOutput("x".repeat(MAX_TOOL_OUTPUT_CHARS + 500));

    expect(output).toMatch(/truncado: 500 caracteres/);
    expect(output.length).toBeLessThan(MAX_TOOL_OUTPUT_CHARS + 200);
  });

  it("texto dentro do teto passa intacto", () => {
    expect(truncateOutput("curto")).toBe("curto");
  });

  it("um enunciado gigante não escapa pelo `get_current_question`", async () => {
    const port = new FakePort();
    port.questions.set("q-1", question({ statementLatex: "y".repeat(50_000) }));

    const output = await toolsOf(port)("get_current_question").execute({ questionId: "q-1" });
    expect(output).toMatch(/truncado/);
  });

  it("um log de `pgfplots` não escapa pelos diagnósticos", async () => {
    const port = new FakePort();
    port.render = {
      jobId: "job-1",
      state: "DONE",
      success: true,
      durationMs: 1,
      finishedAt: null,
      diagnostics: Array.from({ length: 900 }, (_, i) => ({
        severity: "info",
        message: `Overfull \\hbox número ${i} com bastante texto para encher a linha inteira`,
      })),
    };

    const output = await toolsOf(port)("get_render_diagnostics").execute({ questionId: "q-1" });
    expect(output).toMatch(/truncado/);
  });
});

/**
 * O guarda.
 *
 * Varre o módulo do agente atrás do que ele não pode ter. Sem isto, "o agente não escreve" é uma
 * frase no README que a próxima tool contradiz sem ninguém notar.
 */
describe("guarda: o agente não tem caminho de escrita", () => {
  const agentsDir = fileURLToPath(new URL("../src/modules/agents", import.meta.url));

  const sources = async (): Promise<{ file: string; code: string }[]> => {
    const out: { file: string; code: string }[] = [];

    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (/\.tsx?$/.test(entry.name))
          out.push({ file: full, code: readFileSync(full, "utf8") });
      }
    };

    await walk(agentsDir);
    return out;
  };

  it("nenhuma escrita no banco", async () => {
    // O receptor entra na expressão de propósito. A primeira versão procurava só o verbo e
    // acusou `next.delete(id)` num `Set` de ids aprovados na tela de revisão — e um guarda que
    // acusa o que não é acaba silenciado por quem esbarra nele, e aí para de guardar qualquer
    // coisa. Aqui só conta escrita de banco: `prisma.x.create`, `client.x.update`, `tx.x.delete`.
    const forbidden =
      /\b(prisma|client|tx)\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/;

    // Controle positivo: um guarda cuja expressão deixou de casar com escrita nenhuma passa
    // verde para sempre, e ninguém percebe. Este trecho é uma escrita de verdade.
    expect(forbidden.test("await client.question.update({ where: { id } })")).toBe(true);
    expect(forbidden.test("await prisma.questionOption.deleteMany({})")).toBe(true);
    // E o que **não** é escrita de banco continua passando.
    expect(forbidden.test("next.delete(id)")).toBe(false);

    for (const { file, code } of await sources()) {
      expect({ file, hit: forbidden.test(code) }).toEqual({ file, hit: false });
    }
  });

  it("nenhum SQL cru", async () => {
    // Uma tool com SQL arbitrário é uma tool de escrita disfarçada de leitura.
    for (const { file, code } of await sources()) {
      expect({ file, hit: /\$(queryRaw|executeRaw)/.test(code) }).toEqual({ file, hit: false });
    }
  });

  it("nenhum processo externo", async () => {
    for (const { file, code } of await sources()) {
      const hit = /node:child_process|execFile|spawnSync|\bspawn\(/.test(code);
      expect({ file, hit }).toEqual({ file, hit: false });
    }
  });

  it("nenhuma tool fora da lista fechada", async () => {
    // Uma tool nova precisa passar por `READ_ONLY_TOOL_NAMES`, que é revisado.
    for (const tool of buildAgentTools(new FakePort(), FOCUS)) {
      expect(READ_ONLY_TOOL_NAMES).toContain(tool.name);
    }
  });

  it("a porta de leitura não tem verbo de escrita", async () => {
    const port = readFileSync(path.join(agentsDir, "application/agent-read-port.ts"), "utf8");

    for (const verb of ["save", "update", "delete", "insert", "create"]) {
      expect({ verb, hit: new RegExp(`\\b${verb}\\w*\\s*\\(`, "i").test(port) }).toEqual({
        verb,
        hit: false,
      });
    }
  });
});

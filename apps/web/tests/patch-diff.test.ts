import { describe, expect, it } from "vitest";

import { diffPatch, type QuestionState } from "@modules/agents/domain/patch-diff";
import { PATCH_SCHEMA_VERSION, parseQuestionPatch } from "@modules/agents/domain/question-patch";
import {
  buildProposeTools,
  createPatchCollector,
  PROPOSE_TOOL_NAMES,
} from "@modules/agents/application/build-propose-tools";
import { PatchRejectedError } from "@modules/agents/domain/question-patch";

/**
 * O diff é o que o usuário aprova. Uma mudança inventada aqui treina quem revisa a aprovar sem
 * olhar — que é exatamente o que a aprovação explícita existe para impedir.
 */

const state: QuestionState = {
  statementLatex: "Qual é a taxa?",
  solutionLatex: "",
  complementLatex: "",
  nickname: null,
  options: [
    { id: "o-1", statementLatex: "1\\%", isCorrect: false },
    { id: "o-2", statementLatex: "2\\%", isCorrect: true },
    { id: "o-3", statementLatex: "3\\%", isCorrect: false },
  ],
  metadata: { board: "CESPE", year: 2024, difficulty: 5 },
  tags: ["juros", "matemática"],
};

const patch = (over: Record<string, unknown>) =>
  parseQuestionPatch({ schemaVersion: PATCH_SCHEMA_VERSION, summary: "teste", ...over });

const diff = (over: Record<string, unknown>) => diffPatch(state, patch(over));

describe("só mudança de verdade vira linha", () => {
  it("reescrita idêntica não aparece", () => {
    // O agente devolve o campo inteiro mesmo quando mexeu numa vírgula.
    expect(
      diff({
        fields: [
          { field: "statementLatex", value: "Qual é a taxa?" },
          { field: "solutionLatex", value: "Nova resolução" },
        ],
      }).map((change) => change.id),
    ).toEqual(["field:solutionLatex"]);
  });

  it("metadado com o mesmo valor não aparece", () => {
    expect(diff({ metadata: { board: "CESPE", year: 2025 } }).map((c) => c.id)).toEqual([
      "metadata:year",
    ]);
  });

  it("tags na ordem diferente **não** são mudança", () => {
    // Tag não tem ordem; mostrar "mudou" seria uma mudança inventada.
    expect(diff({ tags: { names: ["matemática", "juros"] } })).toEqual([]);
  });

  it("reordenação que devolve a mesma ordem não aparece", () => {
    expect(diff({ reorder: { optionIds: ["o-1", "o-2", "o-3"] } })).toEqual([]);
  });

  it("gabarito que já era aquele não aparece", () => {
    expect(diff({ options: [{ optionId: "o-2", isCorrect: true }] })).toEqual([]);
  });
});

describe("o que a linha mostra", () => {
  it("a letra da alternativa vem da posição atual, e é só rótulo", () => {
    const [change] = diff({ options: [{ optionId: "o-3", statementLatex: "4\\%" }] });

    expect(change?.label).toBe("Alternativa c)");
    // O endereço continua sendo o id.
    expect(change?.id).toBe("option:o-3:text");
  });

  it("LaTeX é marcado, texto curto não", () => {
    // Um enunciado numa linha de texto corrido é ilegível; uma banca numa caixa de código é ruído.
    const changes = diff({
      fields: [{ field: "statementLatex", value: "Outro" }],
      metadata: { board: "CEBRASPE" },
    });

    expect(changes.find((c) => c.id === "field:statementLatex")?.latex).toBe(true);
    expect(changes.find((c) => c.id === "metadata:board")?.latex).toBe(false);
  });

  it("a reordenação é mostrada por trecho, não por uuid", () => {
    const [change] = diff({ reorder: { optionIds: ["o-3", "o-1", "o-2"] } });

    expect(change?.after).toBe("3\\% · 1\\% · 2\\%");
    expect(change?.before).toBe("1\\% · 2\\% · 3\\%");
  });

  it("valor vazio aparece como `(vazio)`, não como nada", () => {
    const [change] = diff({ fields: [{ field: "complementLatex", value: "Novo" }] });
    expect(change?.before).toBe("(vazio)");
  });

  it("gabarito virou linha própria, separada do texto", () => {
    // São duas aprovações diferentes: mudar a redação e mudar qual está certa.
    const changes = diff({
      options: [{ optionId: "o-1", statementLatex: "1,5\\%", isCorrect: true }],
    });

    expect(changes.map((c) => c.id)).toEqual(["option:o-1:text", "option:o-1:correct"]);
  });

  it("alternativa que sumiu do estado não vira linha órfã", () => {
    // O agente propôs sobre um estado que mudou; a linha seria impossível de aprovar.
    expect(diff({ options: [{ optionId: "o-99", statementLatex: "x" }] })).toEqual([]);
  });
});

describe("as tools de proposta", () => {
  const toolsOf = () => {
    const collector = createPatchCollector();
    const map = new Map(buildProposeTools(collector).map((tool) => [tool.name, tool]));
    return { collector, tool: (name: string) => map.get(name) };
  };

  it("são as cinco declaradas", () => {
    expect(buildProposeTools(createPatchCollector()).map((t) => t.name)).toEqual([
      ...PROPOSE_TOOL_NAMES,
    ]);
  });

  it("guardam o patch na bandeja, sem tocar em banco", () => {
    // A ausência de escrita continua verificada pelo teste de guarda do módulo.
    const { collector, tool } = toolsOf();

    return tool("propose_question_patch")
      ?.execute({
        summary: "Corrige a crase.",
        fields: [{ field: "statementLatex", value: "Qual é a taxa à vista?" }],
      })
      .then((output) => {
        expect(collector.patches).toHaveLength(1);
        expect(output).toMatch(/Proposta recebida/);
        expect(output).toMatch(/statementLatex/);
      });
  });

  it("preenchem `schemaVersion` — o modelo esquece quase sempre", () => {
    const { collector, tool } = toolsOf();

    return tool("propose_tags")
      ?.execute({ summary: "Acrescenta tag.", tags: { names: ["juros"] } })
      .then(() => {
        expect(collector.patches[0]?.schemaVersion).toBe(PATCH_SCHEMA_VERSION);
      });
  });

  it("recusam o que a whitelist não permite, e a bandeja fica vazia", async () => {
    const { collector, tool } = toolsOf();

    await expect(
      tool("propose_metadata_patch")?.execute({
        summary: "Aprova a questão.",
        metadata: { validationStatus: "VALID" },
      }),
    ).rejects.toThrow(PatchRejectedError);

    expect(collector.patches).toEqual([]);
  });

  it("a mesma proposta duas vezes entra **uma** vez", async () => {
    // Contra o Ollama real, o modelo propôs o mesmo patch três vezes, uma por rodada, mesmo com a
    // resposta da tool pedindo para não repetir. Três propostas idênticas na tela de revisão
    // obrigariam o usuário a comparar as três para descobrir que são a mesma.
    const { collector, tool } = toolsOf();
    const body = {
      summary: "Corrige a crase.",
      fields: [{ field: "statementLatex", value: "Qual é a taxa à vista?" }],
    };

    await tool("propose_question_patch")?.execute(body);
    const second = await tool("propose_question_patch")?.execute(body);

    expect(collector.patches).toHaveLength(1);
    expect(second).toMatch(/já foi registrada/);
  });

  it("summary diferente para a **mesma** mudança continua sendo repetição", async () => {
    // O modelo reescreve a frase a cada tentativa; duas frases não fazem duas mudanças.
    const { collector, tool } = toolsOf();
    const fields = [{ field: "statementLatex", value: "Qual é a taxa à vista?" }];

    await tool("propose_question_patch")?.execute({ summary: "Corrige a crase.", fields });
    await tool("propose_question_patch")?.execute({ summary: "Ajusta acentuação.", fields });

    expect(collector.patches).toHaveLength(1);
  });

  it("mudança diferente entra como proposta nova", async () => {
    const { collector, tool } = toolsOf();

    await tool("propose_question_patch")?.execute({
      summary: "a",
      fields: [{ field: "statementLatex", value: "um" }],
    });
    await tool("propose_question_patch")?.execute({
      summary: "b",
      fields: [{ field: "statementLatex", value: "outro" }],
    });

    expect(collector.patches).toHaveLength(2);
  });

  it("a resposta ao modelo é curta e pede para ele não repetir", async () => {
    // Devolver o patch inteiro convidaria o modelo a comentá-lo, e o turno se perde com o agente
    // discutindo consigo mesmo o que já propôs.
    const { tool } = toolsOf();
    const output = await tool("propose_option_patch")?.execute({
      summary: "Marca a correta.",
      options: [{ optionId: "o-1", isCorrect: true }],
    });

    expect(output?.length).toBeLessThan(300);
    expect(output).toMatch(/Não proponha a mesma mudança de novo/);
  });
});

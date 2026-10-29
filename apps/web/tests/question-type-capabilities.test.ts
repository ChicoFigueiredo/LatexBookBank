import { beforeAll, describe, expect, it } from "vitest";

import "@modules/questions/domain/plugins";
import { isExclusiveCorrect } from "@modules/questions/application/mutate-options";
import {
  InvalidQuestionTypeError,
  planQuestion,
} from "@modules/questions/domain/question-blueprint";
import {
  pluginFor,
  registerQuestionType,
  registeredPlugins,
  visibleOptions,
  type QuestionTypePlugin,
} from "@modules/questions/domain/question-type-plugin";
import { planApproval } from "@modules/scan/domain/approval-plan";
import type { ScanItem } from "@modules/scan/domain/scan-item";

/**
 * O plugin declara as capacidades do tipo (tarefa E4 da revisão de 2026-09-23 · STM-02, SPA-04).
 *
 * "Que tipo tem alternativas", "quantas nascem" e "só uma pode ser correta" eram decididos fora do
 * registry, em tabelas e comparações que discordavam entre si: a criação dava duas alternativas a
 * `TRUE_FALSE`, a aprovação do scan dava zero. Registrar um tipo novo exigia achá-las à mão.
 *
 * Aqui um tipo de teste é registrado com capacidades próprias, e cada consumidor tem de segui-las
 * — sem que nenhum arquivo fora do plugin saiba o nome dele. O registry é global por construção, e
 * este arquivo roda isolado dos outros, então o registro não vaza.
 */

const NOVO = "TRUE_FALSE" as const;

const plugin: QuestionTypePlugin = {
  type: NOVO,
  label: "Certo ou errado",
  hint: "três itens, cada um certo ou errado",
  options: { initial: 3, exclusiveCorrect: false },
  validate: () => [],
  buildLatexBlocks: (question) => [
    { origin: "statementLatex", lines: [question.statementLatex], prefixLines: 0 },
  ],
};

describe("todo plugin registrado declara o que a interface precisa", () => {
  it("rótulo, dica e alternativas", () => {
    for (const entry of registeredPlugins()) {
      expect(entry.label.trim(), entry.type).not.toBe("");
      expect(entry.hint.trim(), entry.type).not.toBe("");
      if (entry.options !== null) {
        expect(Number.isInteger(entry.options.initial), entry.type).toBe(true);
        expect(typeof entry.options.exclusiveCorrect, entry.type).toBe("boolean");
      }
    }
  });

  it("a ordem do registro é a do menu de criação", () => {
    expect(registeredPlugins().map((entry) => entry.type)).toEqual([
      "MULTIPLE_CHOICE",
      "MULTIPLE_CORRECT",
      "DISCURSIVE",
    ]);
  });
});

describe("um tipo sem plugin não nasce", () => {
  it("criar questão de tipo do vocabulário sem plugin é recusado", () => {
    // `CESPE` está no vocabulário legado, mas sem plugin a questão nasceria sem validação, sem
    // corpo LaTeX e sem gabarito — e com duas alternativas que ninguém escolheu.
    expect(pluginFor("CESPE")).toBeNull();
    expect(() => planQuestion({ type: "CESPE" })).toThrow(InvalidQuestionTypeError);
  });
});

describe("um tipo novo é seguido pelos consumidores sem que eles saibam o nome dele", () => {
  // No `beforeAll`, e não solto no `describe`: o corpo do `describe` roda na coleta, antes dos
  // testes de cima, que conferem o registry sem o tipo de teste.
  beforeAll(() => registerQuestionType(plugin));

  it("a criação dá as alternativas iniciais que o plugin declara", () => {
    expect(planQuestion({ type: NOVO }).optionSortKeys).toHaveLength(3);
  });

  it("a exclusividade da correta vem do plugin", () => {
    expect(isExclusiveCorrect(NOVO)).toBe(false);
  });

  it("as alternativas visíveis vêm do plugin", () => {
    const options = [{ id: "o1" }, { id: "o2" }];

    expect(visibleOptions(NOVO, options)).toEqual(options);
    // A discursiva guarda as alternativas de quando foi escolha simples, e não as mostra.
    expect(visibleOptions("DISCURSIVE", options)).toEqual([]);
  });

  it("a aprovação do scan monta as alternativas do tipo carimbado pela zona", () => {
    const question = scanQuestion("Julgue os itens. a) Certo b) Errado c) Certo d) Errado", NOVO);

    const { steps } = planApproval({
      items: [question],
      profile: { id: "book-fme-v1", version: 1, defaultQuestionType: "DISCURSIVE" },
      destinationId: null,
      includeSuggested: false,
      existingNodes: [],
      existingAnchors: [],
    });

    expect(steps[0]).toMatchObject({
      type: "createNode",
      question: { type: NOVO, options: ["Certo", "Errado", "Certo", "Errado"] },
    });
  });
});

describe("a zona que carimba um tipo sem plugin", () => {
  it("não cria questão desse tipo — vale o padrão do perfil", () => {
    const question = scanQuestion("Some as corretas. a) 01 b) 02 c) 04 d) 08", "SUM_OF_CORRECT");

    const { steps } = planApproval({
      items: [question],
      profile: { id: "book-fme-v1", version: 1, defaultQuestionType: "DISCURSIVE" },
      destinationId: null,
      includeSuggested: false,
      existingNodes: [],
      existingAnchors: [],
    });

    expect(steps[0]).toMatchObject({ type: "createNode", question: { type: "DISCURSIVE" } });
  });
});

/** Uma questão aprovada do scan, com LaTeX revisado e o tipo carimbado pela zona. */
function scanQuestion(latex: string, questionType: string): ScanItem {
  const base = {
    id: "q",
    key: "Q",
    kind: "QUESTION" as const,
    parentKey: null,
    originalLabel: null,
    number: null,
    title: null,
    pageNumber: 1,
    printedPage: null,
    regions: [
      {
        pageNumber: 1,
        role: "PRIMARY" as const,
        box: { x: 0.1, y: 0.1, width: 0.5, height: 0.1 },
      },
    ],
    text: "",
    latex: null,
    needsMath: false,
    confidence: 0.9,
    confidenceParts: {},
    evidence: [],
    diagnostic: null,
    metadata: { questionType },
    reviewState: "APPROVED" as const,
    sortOrder: 0,
    reviewedText: null,
    reviewedLatex: latex,
    origin: "SCAN" as const,
    aiDecision: null,
    mathResult: null,
    documentNodeId: null,
    approvedAt: null,
  };

  return {
    ...base,
    proposed: {
      kind: base.kind,
      parentKey: base.parentKey,
      title: base.title,
      originalLabel: base.originalLabel,
      number: base.number,
      regions: base.regions,
      text: base.text,
      latex: base.latex,
      confidence: base.confidence,
    },
  } as ScanItem;
}

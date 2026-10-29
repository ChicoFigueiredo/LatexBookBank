import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { jsonRequest, paramsOf, seedLibrary, type SeedQuestion } from "./support/assessment-seed";
import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * O gabarito marca todas as corretas, e a discursiva sai sem alternativas (#262 · ACV-07, SPA-02).
 *
 * A avaliação reduzia o gabarito a **uma** alternativa (`options.find(isCorrect)`) e imprimia toda
 * alternativa guardada, sem olhar o tipo. Uma múltipla escolha com `b` e `d` corretas saía com o
 * gabarito `b` e um `[X]` só na versão do professor; uma questão trocada para discursiva saía com
 * a)…e) debaixo do enunciado; e toda discursiva acendia o aviso "sem alternativa correta".
 *
 * Pelas rotas, contra um banco de verdade. As alternativas não são embaralhadas
 * (`shuffleOptions: false`), para que as letras esperadas sejam as da ordem em que a questão foi
 * escrita — uma fonte que não depende do código sob teste.
 */

let dispose: () => Promise<void>;

beforeAll(async () => {
  dispose = (await createTempDatabase()).dispose;
});

afterAll(async () => {
  await dispose();
});

const VARIAS: SeedQuestion = {
  type: "MULTIPLE_CORRECT",
  statement: "Quais são primos?",
  options: [
    { text: "4" },
    { text: "5", correct: true },
    { text: "6" },
    { text: "7", correct: true },
    { text: "8" },
  ],
};

/** Uma questão que já foi de escolha simples: as alternativas ficaram no banco. */
const DISCURSIVA_COM_SOBRA: SeedQuestion = {
  type: "DISCURSIVE",
  statement: "Demonstre que há infinitos primos.",
  options: [{ text: "sobra um", correct: true }, { text: "sobra dois" }, { text: "sobra três" }],
};

async function prova(slug: string, ...questoes: SeedQuestion[]) {
  const library = await seedLibrary(slug);
  const questions = await import("../app/api/assessments/[assessmentId]/questions/route");
  const variants = await import("../app/api/assessments/[assessmentId]/variants/route");
  const detail = await import("../app/api/assessments/[assessmentId]/route");
  const { createAssessment } =
    await import("@modules/assessments/infrastructure/prisma-assessment-repository");

  const { id: assessmentId } = await createAssessment({
    workspaceId: library.workspace.id,
    title: "Prova",
    subtitle: null,
    notes: null,
  });

  const ids: string[] = [];
  for (const input of questoes) {
    const { questionId } = await library.question(input);
    ids.push(questionId);
    await questions.POST(jsonRequest("POST", { questionId }), paramsOf({ assessmentId }));
  }

  const sortear = async () => {
    const response = await variants.POST(
      jsonRequest("POST", { label: "A", seed: 11, shuffleQuestions: false, shuffleOptions: false }),
      paramsOf({ assessmentId }),
    );
    return {
      status: response.status,
      body: (await response.json()) as {
        error?: string;
        questionIds?: string[];
        answers: Record<string, readonly string[]>;
        latex: Record<"STUDENT" | "TEACHER" | "ANSWER_KEY", string>;
      },
    };
  };

  const ler = async () => {
    const response = await detail.GET(jsonRequest("GET"), paramsOf({ assessmentId }));
    return (await response.json()) as {
      items: { questionId: string; optionCount: number; missingCorrect: boolean }[];
    };
  };

  return { ids, sortear, ler };
}

const count = (text: string, piece: string) => text.split(piece).length - 1;

describe("questão de várias corretas", () => {
  it("o gabarito devolve todas as letras corretas", async () => {
    const { ids, sortear } = await prova("varias-gabarito", VARIAS);

    const { status, body } = await sortear();

    expect(status).toBe(201);
    expect(body.answers[ids[0]!]).toEqual(["b", "d"]);
  });

  it("a versão do professor marca as duas, e a tabela do gabarito imprime as duas", async () => {
    const { sortear } = await prova("varias-impressas", VARIAS);

    const { body } = await sortear();

    expect(count(body.latex.TEACHER, "\\textbf{[X]}")).toBe(2);
    expect(body.latex.TEACHER).toContain("\\textbf{[X]} 5");
    expect(body.latex.TEACHER).toContain("\\textbf{[X]} 7");
    expect(body.latex.ANSWER_KEY).toContain("1 & b, d \\\\");
  });
});

describe("discursiva com alternativas guardadas", () => {
  it("sai sem alternativas na prova do aluno e na do professor", async () => {
    const { sortear } = await prova("discursiva-impressa", DISCURSIVA_COM_SOBRA);

    const { status, body } = await sortear();

    expect(status).toBe(201);
    for (const latex of [body.latex.STUDENT, body.latex.TEACHER]) {
      expect(latex).not.toContain("sobra");
      expect(latex).not.toContain("\\textbf{[X]}");
    }
    expect(body.latex.ANSWER_KEY).toContain("1 & --- \\\\");
  });

  it("não acende o aviso de 'sem alternativa correta'", async () => {
    const { ler } = await prova("discursiva-aviso", DISCURSIVA_COM_SOBRA, {
      type: "MULTIPLE_CHOICE",
      statement: "Sem correta marcada",
      options: [{ text: "x" }, { text: "y" }],
    });

    const { items } = await ler();

    expect(items.map((item) => [item.optionCount, item.missingCorrect])).toEqual([
      [0, false],
      [2, true],
    ]);
  });
});

describe("tipo que a avaliação não sabe imprimir", () => {
  it("o sorteio recusa com 409 e diz qual questão, em vez de imprimir um gabarito errado", async () => {
    const { ids, sortear } = await prova("tipo-sem-plugin", {
      type: "SUM_OF_CORRECT",
      statement: "Some as corretas.",
      options: [
        { text: "01", correct: true },
        { text: "02", correct: true },
      ],
    });

    const { status, body } = await sortear();

    expect(status).toBe(409);
    expect(body).toMatchObject({ error: "unsupported_question_type", questionIds: [ids[0]] });
  });
});

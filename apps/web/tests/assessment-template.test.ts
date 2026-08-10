import { describe, expect, it } from "vitest";

import {
  escapeText,
  renderAssessment,
  TEMPLATE_AUDIENCES,
  type AssessmentQuestionContent,
} from "@modules/assessments/domain/assessment-template";
import { buildVariant } from "@modules/assessments/domain/variant";

/**
 * As três versões saem **do mesmo sorteio**.
 *
 * Se cada uma embaralhasse por conta própria, o gabarito do professor não corresponderia à prova
 * do aluno — e ninguém perceberia até a correção, quando já não há o que fazer.
 *
 * Verificado compilando as três com `pdflatex`: mesma ordem de questões, mesmas letras, e o
 * gabarito (`— · a · d`) igual aos `[X]` da versão do professor.
 */

const content: Record<string, AssessmentQuestionContent> = {
  "q-1": {
    questionId: "q-1",
    statementLatex: "Um capital de \\SI{1000}{\\real} rende quanto?",
    solutionLatex: "$M = C(1+it)$",
    options: { "o-a": "\\SI{1020}{\\real}", "o-b": "\\SI{1060}{\\real}", "o-e": "nenhuma" },
    correctOptionId: "o-b",
    points: 2,
  },
  "q-2": {
    questionId: "q-2",
    statementLatex: "Demonstre o teorema.",
    solutionLatex: "A demonstração usa uma paralela.",
    options: {},
    correctOptionId: null,
    points: 3,
  },
};

const variant = buildVariant({
  label: "A",
  seed: 20260810,
  questions: [
    { questionId: "q-1", optionIds: ["o-a", "o-b", "o-e"], pinnedLastOptionIds: ["o-e"] },
    { questionId: "q-2", optionIds: [] },
  ],
});

const header = {
  title: "Prova & Avaliação",
  subtitle: "Bimestral",
  notes: "Justifique.",
  variantLabel: "A",
};

const render = (audience: (typeof TEMPLATE_AUDIENCES)[number]) =>
  renderAssessment({
    audience,
    header,
    variant,
    content,
    options: { answerSpaceCm: 3, showPoints: true },
  });

describe("as três versões concordam", () => {
  it("todas compilam a partir do mesmo documento", () => {
    for (const audience of TEMPLATE_AUDIENCES) {
      const latex = render(audience);
      expect(latex).toContain("\\begin{document}");
      expect(latex).toContain("\\end{document}");
    }
  });

  it("a letra da correta é a mesma no professor e no gabarito", () => {
    // O ponto inteiro de o template ler a variante em vez de sortear.
    const letter = variant.questions.find((q) => q.questionId === "q-1")?.labelByOptionId["o-b"];

    expect(render("TEACHER")).toContain("\\textbf{[X]} \\SI{1060}{\\real}");
    expect(render("ANSWER_KEY")).toMatch(new RegExp(`& ${letter} \\\\\\\\`));
  });

  it("aluno e professor têm a **mesma** ordem de alternativas", () => {
    const options = variant.questions.find((q) => q.questionId === "q-1")?.optionIds ?? [];
    const student = render("STUDENT");
    const teacher = render("TEACHER");

    const positionsIn = (latex: string) =>
      options.map((id) => latex.indexOf(content["q-1"]?.options[id] ?? ""));

    // As posições relativas precisam ser as mesmas nos dois documentos.
    const order = (values: number[]) =>
      values.map((_, i) => i).sort((a, b) => (values[a] as number) - (values[b] as number));
    expect(order(positionsIn(student))).toEqual(order(positionsIn(teacher)));
  });
});

describe("o que cada versão mostra", () => {
  it("o aluno não vê resposta nem resolução", () => {
    const student = render("STUDENT");

    expect(student).not.toContain("[X]");
    expect(student).not.toContain("Resolução");
    expect(student).not.toContain("A demonstração usa uma paralela");
  });

  it("o professor vê a marca **no lugar da alternativa**", () => {
    // Corrigir olhando a prova é o gesto real; uma lista no fim obrigaria a ir e voltar.
    const teacher = render("TEACHER");

    expect(teacher).toContain("\\textbf{[X]}");
    expect(teacher).toContain("\\textbf{Resolução.}");
    expect(teacher).toContain("[PROFESSOR]");
  });

  it("só o aluno tem linha de nome e espaço de resposta", () => {
    expect(render("STUDENT")).toContain("Nome:");
    expect(render("STUDENT")).toContain("\\vspace{3.0cm}");

    // Na do professor o espaço empurraria a resolução para longe do enunciado.
    expect(render("TEACHER")).not.toContain("\\vspace{3.0cm}");
    expect(render("TEACHER")).not.toContain("Nome:");
  });

  it("o gabarito é tabela, e discursiva sai como traço", () => {
    const key = render("ANSWER_KEY");

    expect(key).toContain("\\begin{tabular}");
    expect(key).toContain("& --- \\\\");
    expect(key).toContain("[GABARITO]");
  });

  it("as instruções não vão para o gabarito", () => {
    expect(render("STUDENT")).toContain("Justifique");
    expect(render("ANSWER_KEY")).not.toContain("Justifique");
  });
});

describe("o preâmbulo", () => {
  it("declara `\\real` — sem ele metade do acervo não compila", () => {
    // Descoberto compilando questão de verdade, na Fase 6.
    expect(render("STUDENT")).toContain("\\DeclareSIUnit{\\real}{R\\$}");
  });

  it("um preâmbulo próprio substitui o padrão", () => {
    const latex = renderAssessment({
      audience: "STUDENT",
      header,
      variant,
      content,
      options: { preambleLatex: "\\documentclass{book}" },
    });

    expect(latex.startsWith("\\documentclass{book}")).toBe(true);
  });
});

describe("escape", () => {
  it("o cabeçalho é escapado — `&` num título quebraria a compilação", () => {
    expect(render("STUDENT")).toContain("Prova \\& Avaliação");
  });

  it("o enunciado **não** é escapado — ele já é LaTeX", () => {
    // Escapá-lo transformaria `\frac{1}{2}` em texto literal.
    expect(render("STUDENT")).toContain("\\SI{1000}{\\real}");
  });

  it("escapa o que o LaTeX trata como comando", () => {
    expect(escapeText("100% de R$ 50 & mais")).toBe("100\\% de R\\$ 50 \\& mais");
    expect(escapeText("a~b^c")).toBe("a\\~{}b\\^{}c");
  });
});

describe("dado incoerente", () => {
  it("questão sem conteúdo **falha**, em vez de sumir da prova", () => {
    // Pular em silêncio produziria uma prova com uma questão a menos e numeração que não bate
    // com o gabarito.
    const orphan = buildVariant({
      label: "A",
      seed: 1,
      questions: [{ questionId: "inexistente", optionIds: [] }],
    });

    expect(() =>
      renderAssessment({ audience: "STUDENT", header, variant: orphan, content }),
    ).toThrow(/Sem conteúdo/);
  });
});

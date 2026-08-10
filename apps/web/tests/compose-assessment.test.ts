import { describe, expect, it } from "vitest";

import {
  composeVariant,
  composeVersions,
  EmptyAssessmentError,
  MissingQuestionError,
  type AssessmentRecord,
} from "@modules/assessments/application/compose-assessment";
import type { AssessmentQuestionContent } from "@modules/assessments/domain/assessment-template";
import { fingerprint } from "@modules/assessments/domain/variant";

/**
 * Da avaliação guardada às três versões.
 *
 * O sorteio e o template já são testados sozinhos. O que se afirma aqui é a **ordem**: sortear uma
 * vez e usar a mesma variante nas três chamadas. Sortear por versão daria três provas diferentes
 * com o mesmo nome — a do aluno com a resposta em `c`, a do professor com ela em `a` —, que é o
 * pior defeito possível numa prova, porque só aparece na correção.
 */

const question = (id: string, correct: string): AssessmentQuestionContent => ({
  questionId: id,
  statementLatex: `Enunciado de ${id}`,
  solutionLatex: "",
  options: { [`${id}-o1`]: "um", [`${id}-o2`]: "dois", [`${id}-o3`]: "três" },
  correctOptionId: correct,
  points: null,
});

const content: Record<string, AssessmentQuestionContent> = {
  q1: question("q1", "q1-o2"),
  q2: question("q2", "q2-o3"),
};

const assessment: AssessmentRecord = {
  id: "a1",
  title: "Prova",
  subtitle: null,
  notes: null,
  items: [
    { questionId: "q1", points: null, pinnedLastOptionIds: [] },
    { questionId: "q2", points: null, pinnedLastOptionIds: [] },
  ],
};

const spec = { label: "A", seed: 2026, shuffleQuestions: true, shuffleOptions: true };

describe("sortear", () => {
  it("a mesma seed dá a mesma prova", () => {
    // É o requisito da fase inteira, e o que permite reimprimir a prova de ontem.
    const a = composeVariant(assessment, spec, content);
    const b = composeVariant(assessment, spec, content);

    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it("seeds diferentes dão provas diferentes", () => {
    const a = composeVariant(assessment, spec, content);
    const b = composeVariant(assessment, { ...spec, seed: 777 }, content);

    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it("prova vazia é recusada com o motivo, não com uma prova em branco", () => {
    expect(() => composeVariant({ ...assessment, items: [] }, spec, content)).toThrow(
      EmptyAssessmentError,
    );
  });

  it("questão que sumiu do acervo interrompe — não sai uma prova com um buraco", () => {
    expect(() =>
      composeVariant(
        { ...assessment, items: [{ questionId: "sumida", points: null, pinnedLastOptionIds: [] }] },
        spec,
        content,
      ),
    ).toThrow(MissingQuestionError);
  });

  it("alternativa presa fica no fim", () => {
    // "Nenhuma das anteriores" antes de uma alternativa comum não é embaralhamento, é erro.
    const variant = composeVariant(
      {
        ...assessment,
        items: [{ questionId: "q1", points: null, pinnedLastOptionIds: ["q1-o3"] }],
      },
      spec,
      content,
    );

    const order = variant.questions[0]!.optionIds;
    expect(order[order.length - 1]).toBe("q1-o3");
  });
});

describe("as três versões", () => {
  it("saem da **mesma** variante — a letra do aluno é a letra do gabarito", () => {
    const variant = composeVariant(assessment, spec, content);
    const versions = composeVersions(assessment, variant, content);

    for (const [questionId, letter] of Object.entries(versions.answers)) {
      const correct = content[questionId]!.correctOptionId!;
      const printed = variant.questions.find((q) => q.questionId === questionId)!;

      expect(printed.labelByOptionId[correct]).toBe(letter);
    }
  });

  it("o gabarito sai do mapa, não de um novo sorteio", () => {
    // A diferença entre conferir contra o que foi impresso e torcer para dar o mesmo.
    const variant = composeVariant(assessment, spec, content);
    const first = composeVersions(assessment, variant, content);
    const second = composeVersions(assessment, variant, content);

    expect(first.answers).toEqual(second.answers);
  });

  it("as três audiências vêm preenchidas, e são diferentes entre si", () => {
    const variant = composeVariant(assessment, spec, content);
    const { latexByAudience } = composeVersions(assessment, variant, content);

    expect(latexByAudience.STUDENT).toContain("\\begin{document}");
    expect(latexByAudience.TEACHER).toContain("PROFESSOR");
    expect(latexByAudience.ANSWER_KEY).toContain("GABARITO");
    expect(latexByAudience.STUDENT).not.toBe(latexByAudience.TEACHER);
  });

  it("questão sem correta não derruba a prova — fica fora do gabarito", () => {
    // Discursiva não tem alternativa, e recusar a prova inteira por isso seria absurdo. Quem
    // avisa que o gabarito ficará incompleto é a tela, antes de imprimir.
    const semCorreta = { ...content, q1: { ...content["q1"]!, correctOptionId: null } };
    const variant = composeVariant(assessment, spec, semCorreta);
    const versions = composeVersions(assessment, variant, semCorreta);

    expect(versions.answers["q1"]).toBeUndefined();
    expect(versions.answers["q2"]).toBeTruthy();
  });
});

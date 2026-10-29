import { describe, expect, it } from "vitest";

import type { AssessmentRecord } from "@modules/assessments/application/compose-assessment";
import {
  addQuestionToAssessment,
  AssessmentNotFoundError,
  deleteAssessment,
  drawVariant,
  type AssessmentStore,
  VariantsWouldBeLostError,
} from "@modules/assessments/application/manage-assessments";
import type { QuestionStanding } from "@modules/assessments/domain/admission";
import type { AssessmentQuestionContent } from "@modules/assessments/domain/assessment-template";

/**
 * As regras da avaliação sem o banco (STM-04, STE-03).
 *
 * A pertença à biblioteca (#177) e a trava das variantes só podiam ser provadas contra o Prisma —
 * a primeira morava no adaptador, a segunda na rota. Agora moram no caso de uso, e um acervo em
 * memória basta: o que o adaptador responde são fatos, e quem decide é daqui.
 */

interface Prova {
  readonly record: AssessmentRecord;
  readonly variants: string[];
}

function acervo(
  provas: Record<string, Prova>,
  standing: Record<string, QuestionStanding>,
  content: Record<string, AssessmentQuestionContent> = {},
) {
  const appended: string[] = [];
  const saved: string[] = [];
  const deleted: string[] = [];

  const store: AssessmentStore = {
    create: async () => ({ id: "nova" }),
    find: async (id) => provas[id]?.record ?? null,
    standingOf: async (id, questionId) =>
      provas[id] === undefined ? null : (standing[questionId] ?? { kind: "foreign" }),
    appendItem: async (id, questionId) => {
      if (provas[id]?.record.items.some((item) => item.questionId === questionId)) return "already";
      appended.push(questionId);
      return "added";
    },
    removeItem: async () => undefined,
    variantLabelsOf: async (id) => provas[id]?.variants ?? null,
    delete: async (id) => {
      deleted.push(id);
    },
    contentFor: async () => content,
    saveVariant: async (_id, variant) => {
      saved.push(variant.label);
      return { id: `v-${variant.label}` };
    },
  };

  return { store, appended, saved, deleted };
}

const prova = (items: string[] = [], variants: string[] = []): Prova => ({
  record: {
    id: "p1",
    title: "Prova",
    subtitle: null,
    notes: null,
    items: items.map((questionId) => ({ questionId, points: null, pinnedLastOptionIds: [] })),
  },
  variants,
});

describe("acrescentar questão", () => {
  it("de outra biblioteca é recusada, e nada é gravado", async () => {
    const { store, appended } = acervo({ p1: prova() }, { q1: { kind: "foreign" } });

    expect(await addQuestionToAssessment(store, "p1", "q1")).toEqual({
      added: false,
      reason: "foreign",
    });
    expect(appended).toEqual([]);
  });

  it("na lixeira é recusada (#263)", async () => {
    const { store, appended } = acervo({ p1: prova() }, { q1: { kind: "own", inTrash: true } });

    expect(await addQuestionToAssessment(store, "p1", "q1")).toEqual({
      added: false,
      reason: "in_trash",
    });
    expect(appended).toEqual([]);
  });

  it("da própria biblioteca entra; a repetida volta como 'já estava'", async () => {
    const { store, appended } = acervo(
      { p1: prova(["q2"]) },
      { q1: { kind: "own", inTrash: false }, q2: { kind: "own", inTrash: false } },
    );

    expect(await addQuestionToAssessment(store, "p1", "q1")).toEqual({ added: true });
    expect(await addQuestionToAssessment(store, "p1", "q2")).toEqual({
      added: false,
      reason: "already",
    });
    expect(appended).toEqual(["q1"]);
  });

  it("prova que não existe é erro, e não um 'não acrescentei' qualquer", async () => {
    // O adaptador devolvia `no_section`, e a rota respondia 200 a uma prova inexistente.
    const { store } = acervo({}, {});

    await expect(addQuestionToAssessment(store, "p9", "q1")).rejects.toBeInstanceOf(
      AssessmentNotFoundError,
    );
  });
});

describe("apagar a prova", () => {
  it("com variante sorteada, recusa sem confirmação e não apaga", async () => {
    const { store, deleted } = acervo({ p1: prova([], ["A", "B"]) }, {});

    const recusa = deleteAssessment(store, "p1", { confirmVariants: false });

    await expect(recusa).rejects.toBeInstanceOf(VariantsWouldBeLostError);
    await expect(recusa).rejects.toMatchObject({ variantLabels: ["A", "B"] });
    expect(deleted).toEqual([]);
  });

  it("confirmado, apaga e diz quais variantes se foram", async () => {
    const { store, deleted } = acervo({ p1: prova([], ["A"]) }, {});

    expect(await deleteAssessment(store, "p1", { confirmVariants: true })).toEqual({
      deleted: true,
      variantLabels: ["A"],
    });
    expect(deleted).toEqual(["p1"]);
  });

  it("sem variante, apaga sem pedir confirmação", async () => {
    const { store, deleted } = acervo({ p1: prova() }, {});

    await deleteAssessment(store, "p1", { confirmVariants: false });

    expect(deleted).toEqual(["p1"]);
  });

  it("prova que não existe é erro", async () => {
    const { store } = acervo({}, {});

    await expect(deleteAssessment(store, "p9", { confirmVariants: true })).rejects.toBeInstanceOf(
      AssessmentNotFoundError,
    );
  });
});

describe("sortear a variante", () => {
  it("prova que não existe é erro, e nada é gravado", async () => {
    const { store, saved } = acervo({}, {});

    await expect(
      drawVariant(store, "p9", {
        label: "A",
        seed: 1,
        shuffleQuestions: true,
        shuffleOptions: true,
      }),
    ).rejects.toBeInstanceOf(AssessmentNotFoundError);
    expect(saved).toEqual([]);
  });
});

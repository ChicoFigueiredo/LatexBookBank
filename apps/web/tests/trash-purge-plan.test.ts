import { describe, expect, it } from "vitest";

import { planTrashPurge, type TrashedNode } from "@modules/document-tree/domain/trash-purge";

/**
 * O que esvaziar a lixeira apaga, e o que fica (#258), decidido no domínio (D71).
 *
 * A regra morava no `PrismaTrashPurge`, e o caso de uso `emptyTrash` era um repasse: o nó da
 * questão que uma prova usa fica, com a cadeia de ancestrais que também está na lixeira — sem ela,
 * o `SetNull` de `parentId` soltaria a questão na raiz, e restaurar já não a devolveria ao lugar.
 */

const deletedAt = new Date("2026-10-01T10:00:00Z");

const node = (over: Partial<TrashedNode> & Pick<TrashedNode, "id">): TrashedNode => ({
  parentId: null,
  kind: "QUESTION",
  title: null,
  originalLabel: null,
  deletedAt,
  hasQuestion: false,
  nickname: null,
  questionId: null,
  ...over,
});

/**
 * cap ─ sec ─ q7 (na prova)
 *     └ q8
 * rascunho
 */
const lixeira: readonly TrashedNode[] = [
  node({ id: "cap", kind: "CHAPTER", title: "Capítulo 2" }),
  node({ id: "sec", parentId: "cap", kind: "SECTION", title: "Seção 2.1" }),
  node({
    id: "q7",
    parentId: "sec",
    originalLabel: "7",
    hasQuestion: true,
    nickname: "PA",
    questionId: "Q7",
  }),
  node({ id: "q8", parentId: "cap", originalLabel: "8", hasQuestion: true, questionId: "Q8" }),
  node({ id: "rascunho", kind: "SECTION", title: "Rascunho" }),
];

describe("o plano de esvaziar a lixeira", () => {
  it("sem prova nenhuma, tudo sai: os nós e as questões deles", () => {
    const plan = planTrashPurge(lixeira, new Map());

    expect([...plan.nodeIds].sort()).toEqual(["cap", "q7", "q8", "rascunho", "sec"]);
    expect([...plan.questionIds].sort()).toEqual(["Q7", "Q8"]);
    expect(plan.held).toEqual([]);
  });

  it("a questão da prova fica, com a cadeia de ancestrais na lixeira; o resto sai", () => {
    const plan = planTrashPurge(lixeira, new Map([["Q7", ["Prova B", "Prova A"]]]));

    expect([...plan.nodeIds].sort()).toEqual(["q8", "rascunho"]);
    expect(plan.questionIds).toEqual(["Q8"]);
    expect(plan.held).toEqual([
      { nodeId: "q7", title: "Questão 7 · PA", assessments: ["Prova A", "Prova B"] },
    ]);
  });

  it("o ancestral que não está na lixeira não entra na conta", () => {
    // A seção foi excluída sozinha, e o capítulo continua vivo: a cadeia para nela.
    const plan = planTrashPurge(
      [
        node({ id: "sec", parentId: "cap-vivo", kind: "SECTION", title: "Seção" }),
        node({ id: "q", parentId: "sec", hasQuestion: true, questionId: "Q" }),
      ],
      new Map([["Q", ["Prova"]]]),
    );

    expect(plan.nodeIds).toEqual([]);
    expect(plan.questionIds).toEqual([]);
    expect(plan.held.map((held) => held.nodeId)).toEqual(["q"]);
  });

  it("lixeira vazia, plano vazio", () => {
    expect(planTrashPurge([], new Map())).toEqual({ nodeIds: [], questionIds: [], held: [] });
  });
});

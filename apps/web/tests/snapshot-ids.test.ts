import { describe, expect, it } from "vitest";

import { translateSnapshotIds } from "@modules/portability/domain/snapshot-ids";

/**
 * O snapshot de revisão guarda ids de alternativa, e o `.lbb` os traduz na ida (id → `ref`) e na
 * volta (`ref` → id novo). Sem isso, "desfazer" depois do restore não acharia alternativa nenhuma.
 */

const map = new Map([
  ["uuid-o-1", "o-1"],
  ["uuid-o-2", "o-2"],
  ["uuid-q-1", "q-1"],
]);
const translate = (id: string) => map.get(id);

describe("translateSnapshotIds", () => {
  it("troca o id das alternativas e o de qualquer chave `…Id`/`…Ids`", () => {
    const snapshot = JSON.stringify({
      statementLatex: "antes",
      options: [
        { id: "uuid-o-1", isCorrect: true },
        { id: "uuid-o-2", isCorrect: false },
      ],
      questionId: "uuid-q-1",
      pinnedOptionIds: ["uuid-o-2"],
    });

    expect(JSON.parse(translateSnapshotIds(snapshot, translate))).toEqual({
      statementLatex: "antes",
      options: [
        { id: "o-1", isCorrect: true },
        { id: "o-2", isCorrect: false },
      ],
      questionId: "q-1",
      pinnedOptionIds: ["o-2"],
    });
  });

  it("texto igual a um id fora de chave de id continua intacto", () => {
    const snapshot = JSON.stringify({ statementLatex: "uuid-o-1", tags: ["uuid-q-1"] });

    expect(translateSnapshotIds(snapshot, translate)).toBe(snapshot);
  });

  it("id que o mapa não conhece fica como estava — já não apontava para nada", () => {
    const snapshot = JSON.stringify({ options: [{ id: "alternativa-excluida" }] });

    expect(translateSnapshotIds(snapshot, translate)).toBe(snapshot);
  });

  it("JSON malformado passa sem mudança, em vez de derrubar o backup", () => {
    expect(translateSnapshotIds("{não é json", translate)).toBe("{não é json");
  });
});

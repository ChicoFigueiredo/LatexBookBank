import { describe, expect, it } from "vitest";

import { listTrash } from "@modules/document-tree/application/list-trash";
import type { DeletedNodeRecord } from "@modules/document-tree/domain/document-tree-repository";
import { deletedAncestorOf } from "@modules/document-tree/domain/restoration";

/**
 * O "pode voltar?" da lixeira é a regra do `restoreNode`, e não uma cópia dela (STE-11).
 */

const quando = new Date("2026-10-28T12:00:00.000Z");
const no = (id: string, parentId: string | null): DeletedNodeRecord => ({
  id,
  parentId,
  title: id,
  kind: "SECTION",
  sortKey: "a0",
  deletedAt: quando,
});

describe("listTrash", () => {
  it("o nó cujo pai também está na lixeira não volta sozinho; o de pai vivo, sim", async () => {
    const writer = {
      listDeleted: async () => [no("cap", "raiz-viva"), no("sec", "cap"), no("solta", null)],
    };

    const items = await listTrash(writer, "p1");

    expect(items.map((item) => [item.id, item.restorable])).toEqual([
      ["cap", true],
      ["sec", false],
      ["solta", true],
    ]);
  });
});

describe("deletedAncestorOf", () => {
  it("devolve o pai que impede a volta — é ele que o erro do restaurar nomeia", () => {
    expect(deletedAncestorOf({ parentId: "cap" }, new Set(["cap"]))).toBe("cap");
    expect(deletedAncestorOf({ parentId: "cap" }, new Set())).toBeNull();
    expect(deletedAncestorOf({ parentId: null }, new Set(["cap"]))).toBeNull();
  });
});

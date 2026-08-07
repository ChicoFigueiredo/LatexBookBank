import { describe, expect, it } from "vitest";

import { placementFor, zoneFromOffset } from "../app/publications/[id]/tree-dnd";

/**
 * A aritmética do arraste.
 *
 * Errar o limiar produz um gesto que parece funcionar e cai na zona errada — ninguém percebe
 * até reordenar um capítulo e ele virar filho do vizinho, levando a subárvore junto.
 */

describe("zonas da linha", () => {
  it("terço de cima é antes; terço de baixo é depois; o miolo vira filho", () => {
    expect(zoneFromOffset(0)).toBe("before");
    expect(zoneFromOffset(0.29)).toBe("before");
    expect(zoneFromOffset(0.3)).toBe("child");
    expect(zoneFromOffset(0.5)).toBe("child");
    expect(zoneFromOffset(0.7)).toBe("child");
    expect(zoneFromOffset(0.71)).toBe("after");
    expect(zoneFromOffset(1)).toBe("after");
  });

  it("o miolo é a maior zona, e as bordas são simétricas", () => {
    const samples = Array.from({ length: 101 }, (_, i) => zoneFromOffset(i / 100));
    const count = (zone: string) => samples.filter((s) => s === zone).length;

    // 40/30/30. Não é maioria — reordenar entre irmãos é tão comum quanto reparentar, e dar o
    // miolo inteiro a "virar filho" tornaria difícil soltar exatamente entre dois nós.
    expect(count("child")).toBeGreaterThan(count("before"));
    expect(count("child")).toBeGreaterThan(count("after"));
    expect(count("before")).toBe(count("after"));
  });

  it("ratio fora de 0..1 não inventa zona nova — cai nos extremos", () => {
    expect(zoneFromOffset(-3)).toBe("before");
    expect(zoneFromOffset(4)).toBe("after");
  });
});

describe("zona vira Placement", () => {
  it("cada zona mapeia para exatamente um Placement", () => {
    expect(placementFor("before", "n1")).toEqual({ kind: "before", siblingId: "n1" });
    expect(placementFor("after", "n1")).toEqual({ kind: "after", siblingId: "n1" });
    expect(placementFor("child", "n1")).toEqual({ kind: "lastChild", parentId: "n1" });
  });
});

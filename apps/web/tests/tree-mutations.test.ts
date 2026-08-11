import { describe, expect, it } from "vitest";

import type { TreeNodeRecord } from "@modules/document-tree/domain/document-tree-repository";
import {
  CyclicMoveError,
  NodeNotFoundError,
  assertMoveIsLegal,
  collectSubtree,
  planDuplicate,
  resolvePlacement,
} from "@modules/document-tree/domain/tree-mutations";

/**
 * As regras de mexer na árvore, testadas sem banco.
 *
 * A que mais importa é a rejeição de ciclo: mover um capítulo para dentro de si mesmo não dá
 * erro visível nenhum — o ramo simplesmente deixa de ser alcançável a partir de qualquer raiz e
 * some da tela com tudo dentro.
 */

const node = (
  id: string,
  parentId: string | null,
  sortKey: string,
  title = id,
): TreeNodeRecord => ({
  id,
  parentId,
  kind: "SECTION",
  title,
  sortKey,
  numberingStyle: "ARABIC",
  originalLabel: null,
  question: null,
});

/**
 * cap1 ─ sec1 ─ sub1
 *      └ sec2
 * cap2
 */
const TREE: readonly TreeNodeRecord[] = [
  node("cap1", null, "a0"),
  node("cap2", null, "a1"),
  node("sec1", "cap1", "a0"),
  node("sec2", "cap1", "a1"),
  node("sub1", "sec1", "a0"),
];

describe("subárvore", () => {
  it("inclui o próprio nó e toda a descendência", () => {
    expect([...collectSubtree(TREE, "cap1")].sort()).toEqual(["cap1", "sec1", "sec2", "sub1"]);
    expect(collectSubtree(TREE, "sub1")).toEqual(["sub1"]);
  });

  it("um ciclo já gravado no banco não trava a coleta", () => {
    // `a → b → a`: dado corrompido por importação torta ou edição concorrente.
    const corrupted = [node("a", "b", "a0"), node("b", "a", "a0")];
    expect([...collectSubtree(corrupted, "a")].sort()).toEqual(["a", "b"]);
  });
});

describe("rejeição de ciclo", () => {
  it("recusa mover um nó para dentro de si mesmo", () => {
    expect(() => assertMoveIsLegal(TREE, "cap1", "cap1")).toThrow(CyclicMoveError);
  });

  it("recusa mover um nó para dentro do próprio ramo, em qualquer profundidade", () => {
    expect(() => assertMoveIsLegal(TREE, "cap1", "sec1")).toThrow(CyclicMoveError);
    expect(() => assertMoveIsLegal(TREE, "cap1", "sub1")).toThrow(CyclicMoveError);
  });

  it("permite mover para um ramo irmão e para a raiz", () => {
    expect(() => assertMoveIsLegal(TREE, "sec1", "cap2")).not.toThrow();
    expect(() => assertMoveIsLegal(TREE, "sub1", null)).not.toThrow();
  });

  it("recusa nó ou destino inexistente em vez de criar órfão", () => {
    expect(() => assertMoveIsLegal(TREE, "fantasma", null)).toThrow(NodeNotFoundError);
    expect(() => assertMoveIsLegal(TREE, "sec1", "fantasma")).toThrow(NodeNotFoundError);
  });
});

describe("posicionamento", () => {
  it("primeiro filho vem antes de todos os irmãos", () => {
    const { parentId, sortKey } = resolvePlacement(TREE, { kind: "firstChild", parentId: "cap1" });

    expect(parentId).toBe("cap1");
    expect(sortKey < "a0").toBe(true);
  });

  it("último filho vem depois de todos", () => {
    const { sortKey } = resolvePlacement(TREE, { kind: "lastChild", parentId: "cap1" });
    expect(sortKey > "a1").toBe(true);
  });

  it("em pai vazio, a primeira chave serve para os dois lados", () => {
    const first = resolvePlacement(TREE, { kind: "firstChild", parentId: "sec2" });
    const last = resolvePlacement(TREE, { kind: "lastChild", parentId: "sec2" });

    expect(first.sortKey).toBe("a0");
    expect(last.sortKey).toBe("a0");
  });

  it("antes e depois de um irmão caem exatamente na fresta", () => {
    const before = resolvePlacement(TREE, { kind: "before", siblingId: "sec2" });
    const after = resolvePlacement(TREE, { kind: "after", siblingId: "sec1" });

    expect(before.parentId).toBe("cap1");
    expect("a0" < before.sortKey && before.sortKey < "a1").toBe(true);
    expect("a0" < after.sortKey && after.sortKey < "a1").toBe(true);
  });

  it("recusa âncora inexistente", () => {
    expect(() => resolvePlacement(TREE, { kind: "after", siblingId: "fantasma" })).toThrow(
      NodeNotFoundError,
    );
    expect(() => resolvePlacement(TREE, { kind: "lastChild", parentId: "fantasma" })).toThrow(
      NodeNotFoundError,
    );
  });
});

describe("reordenar o próprio nó", () => {
  /**
   * O caso que quebra se o nó em movimento não sair da lista de irmãos: os limites viriam iguais
   * — a chave dele contra ela mesma — e o gerador recusaria, com razão.
   */
  it("mover um nó para depois dele mesmo não gera limites iguais", () => {
    const { sortKey } = resolvePlacement(TREE, { kind: "after", siblingId: "sec1" }, "sec1");

    expect(sortKey > "a0").toBe(true);
    expect(sortKey < "a1").toBe(true);
  });

  it("mover o último para o fim continua sendo o fim", () => {
    const { sortKey } = resolvePlacement(TREE, { kind: "lastChild", parentId: "cap1" }, "sec2");

    // Sem excluir `sec2`, a chave sairia depois de `a1`; excluindo, sai depois de `a0`.
    expect(sortKey > "a0").toBe(true);
  });

  it("mover o primeiro para antes do segundo o mantém entre os dois vizinhos certos", () => {
    const { sortKey } = resolvePlacement(TREE, { kind: "before", siblingId: "sec2" }, "sec1");
    expect(sortKey < "a1").toBe(true);
  });
});

describe("duplicação", () => {
  it("planeja a subárvore inteira em pré-ordem — o pai sempre antes dos filhos", () => {
    const plan = planDuplicate(TREE, "cap1", { kind: "after", siblingId: "cap1" });

    expect(plan.map((p) => p.sourceId)).toEqual(["cap1", "sec1", "sub1", "sec2"]);

    const seen = new Set<string>();
    for (const step of plan) {
      if (step.parentId !== null && step.sourceId !== "cap1") {
        expect(seen.has(step.parentId), `pai de ${step.sourceId} veio antes`).toBe(true);
      }
      seen.add(step.sourceId);
    }
  });

  it("a raiz da cópia entra na posição pedida, e os descendentes mantêm a ordem relativa", () => {
    const plan = planDuplicate(TREE, "cap1", { kind: "after", siblingId: "cap1" });
    const root = plan[0];
    const sec1 = plan.find((p) => p.sourceId === "sec1");
    const sec2 = plan.find((p) => p.sourceId === "sec2");

    expect(root?.parentId).toBe(null);
    expect(root?.sortKey && "a0" < root.sortKey && root.sortKey < "a1").toBe(true);
    expect(sec1?.sortKey && sec2?.sortKey && sec1.sortKey < sec2.sortKey).toBe(true);
  });

  it("duplicar uma folha planeja um nó só", () => {
    const plan = planDuplicate(TREE, "sub1", { kind: "lastChild", parentId: "sec1" });
    expect(plan).toHaveLength(1);
    expect(plan[0]?.sourceId).toBe("sub1");
  });

  it("recusa duplicar nó inexistente", () => {
    expect(() => planDuplicate(TREE, "fantasma", { kind: "lastChild", parentId: null })).toThrow(
      NodeNotFoundError,
    );
  });
});

describe("propriedade: mover nunca perde nem duplica nó", () => {
  it("aplicar um movimento legal preserva o conjunto de nós e a ausência de ciclo", () => {
    const moves: ReadonlyArray<readonly [string, string | null]> = [
      ["sec1", "cap2"],
      ["sub1", null],
      ["sec2", "cap2"],
    ];

    let current = [...TREE];
    for (const [nodeId, targetParentId] of moves) {
      assertMoveIsLegal(current, nodeId, targetParentId);
      const { sortKey } = resolvePlacement(
        current,
        { kind: "lastChild", parentId: targetParentId },
        nodeId,
      );
      current = current.map((record) =>
        record.id === nodeId ? { ...record, parentId: targetParentId, sortKey } : record,
      );
    }

    expect(current).toHaveLength(TREE.length);
    expect(new Set(current.map((r) => r.id)).size).toBe(TREE.length);

    // Todo nó continua alcançável a partir da raiz.
    const roots = current.filter((r) => r.parentId === null).map((r) => r.id);
    const reachable = new Set(roots.flatMap((id) => collectSubtree(current, id)));
    expect(reachable.size).toBe(TREE.length);
  });
});

import { describe, expect, it } from "vitest";

import { buildTree, walkTree } from "@modules/document-tree/domain/build-tree";
import type { TreeNodeRecord } from "@modules/document-tree/domain/document-tree-repository";

const node = (
  id: string,
  parentId: string | null,
  sortKey: string,
  title = id,
): TreeNodeRecord => ({
  id,
  parentId,
  sortKey,
  title,
  kind: "SECTION",
  numberingStyle: "ARABIC",
  originalLabel: null,
  question: null,
});

const ids = (records: readonly TreeNodeRecord[]) =>
  [...walkTree(buildTree(records))].map((entry) => entry.node.id);

describe("monta a hierarquia", () => {
  it("aninha filhos sob os pais", () => {
    const tree = buildTree([
      node("cap", null, "a0"),
      node("sec", "cap", "a0"),
      node("q1", "sec", "a0"),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.node.id).toBe("cap");
    expect(tree[0]?.children[0]?.node.id).toBe("sec");
    expect(tree[0]?.children[0]?.children[0]?.node.id).toBe("q1");
  });

  it("expõe a profundidade, para a UI não recalcular", () => {
    const tree = buildTree([node("a", null, "a0"), node("b", "a", "a0"), node("c", "b", "a0")]);
    const depths = [...walkTree(tree)].map((entry) => entry.depth);

    expect(depths).toEqual([0, 1, 2]);
  });

  it("ordena irmãos por sortKey, não por ordem de chegada", () => {
    // O `sortKey` é fracionário; a ordem do banco não pode ser presumida.
    expect(ids([node("c", null, "a2"), node("a", null, "a0"), node("b", null, "a1")])).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("dados inconsistentes não somem em silêncio", () => {
  it("promove nó órfão a raiz em vez de descartá-lo", () => {
    // `parentId` apontando para nó inexistente acontece no acervo legado. Descartar perderia
    // conteúdo sem aviso; promover mantém tudo visível e o problema aparente.
    const resultado = ids([node("raiz", null, "a0"), node("orfao", "fantasma", "a1")]);

    expect(resultado).toContain("orfao");
    expect(resultado).toHaveLength(2);
  });

  it("interrompe ciclo em vez de recorrer infinitamente", () => {
    // `a → b → a` derrubaria a renderização. O segundo encontro trata o nó como raiz.
    const resultado = ids([node("a", "b", "a0"), node("b", "a", "a0")]);

    expect(resultado).toHaveLength(2);
    expect(new Set(resultado)).toEqual(new Set(["a", "b"]));
  });

  it("não perde nenhum nó, quaisquer que sejam as inconsistências", () => {
    const records = [
      node("a", null, "a0"),
      node("b", "a", "a0"),
      node("orfao", "nao-existe", "a1"),
      node("c", "b", "a0"),
    ];

    expect(ids(records)).toHaveLength(records.length);
  });
});

describe("árvore vazia", () => {
  it("devolve lista vazia sem quebrar", () => {
    expect(buildTree([])).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import { filterTree } from "@/design-system";
import type { TreeNode } from "@/design-system";

/**
 * O que o filtro precisa acertar não é achar — é **mostrar onde**.
 *
 * "Questão 3" existe em dezenas de capítulos do acervo. Um resultado sem o ramo acima não
 * responde qual delas é, e o usuário abre uma por uma até achar a certa.
 */

const TREE: readonly TreeNode[] = [
  {
    id: "cap-1",
    label: "Juros Simples",
    children: [
      { id: "sec-1", label: "Conceitos iniciais", children: [{ id: "q-1", label: "Questão 3" }] },
      { id: "sec-2", label: "Aplicações" },
    ],
  },
  { id: "cap-2", label: "Juros Compostos", children: [{ id: "q-2", label: "Questão 3" }] },
];

const ids = (nodes: readonly TreeNode[]): string[] =>
  nodes.flatMap((node) => [node.id, ...ids(node.children ?? [])]);

describe("filtro preserva o caminho", () => {
  it("um resultado profundo arrasta os ancestrais junto", () => {
    const result = filterTree(TREE, { query: "Questão 3" });

    expect(ids(result.nodes)).toEqual(["cap-1", "sec-1", "q-1", "cap-2", "q-2"]);
    expect(result.matchCount).toBe(2);
  });

  it("os ancestrais vêm abertos — senão o resultado fica atrás de um caret fechado", () => {
    const result = filterTree(TREE, { query: "Questão 3" });
    expect([...result.expanded].sort()).toEqual(["cap-1", "cap-2", "sec-1"]);
  });

  it("descendentes de quem casa não vêm de carona", () => {
    const result = filterTree(TREE, { query: "Juros Simples" });

    // `cap-1` casou; `sec-1`, `sec-2` e `q-1` não, e não entram.
    expect(ids(result.nodes)).toEqual(["cap-1"]);
    expect(result.matchCount).toBe(1);
  });

  it("ignora acento e caixa", () => {
    expect(filterTree(TREE, { query: "questao 3" }).matchCount).toBe(2);
    expect(filterTree(TREE, { query: "APLICACOES" }).matchCount).toBe(1);
  });

  it("busca vazia devolve a árvore original, sem copiar", () => {
    const result = filterTree(TREE, { query: "   " });
    expect(result.nodes).toBe(TREE);
    expect(result.matchCount).toBe(0);
  });

  it("nada encontrado devolve lista vazia, não a árvore inteira", () => {
    const result = filterTree(TREE, { query: "logaritmo" });
    expect(result.nodes).toEqual([]);
    expect(result.matchCount).toBe(0);
  });
});

describe("predicado combina com a busca por E", () => {
  const isQuestion = (node: TreeNode) => node.id.startsWith("q-");

  it("sozinho, filtra por tipo e mantém o caminho", () => {
    const result = filterTree(TREE, { predicate: isQuestion });
    expect(ids(result.nodes)).toEqual(["cap-1", "sec-1", "q-1", "cap-2", "q-2"]);
  });

  it("com busca, exige os dois", () => {
    const both = filterTree(TREE, { query: "Questão", predicate: isQuestion });
    expect(both.matchCount).toBe(2);

    const conflicting = filterTree(TREE, { query: "Juros", predicate: isQuestion });
    expect(conflicting.matchCount).toBe(0);
    expect(conflicting.nodes).toEqual([]);
  });
});

describe("rótulo que não é texto", () => {
  it("não casa por acidente, e `textOf` resolve quando precisa", () => {
    const nodes: readonly TreeNode[] = [
      { id: "x", label: { type: "span", props: {}, key: null } as never },
    ];

    expect(filterTree(nodes, { query: "span" }).matchCount).toBe(0);
    expect(filterTree(nodes, { query: "alfa", textOf: () => "alfa" }).matchCount).toBe(1);
  });
});

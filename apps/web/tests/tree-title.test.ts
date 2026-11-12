import { describe, expect, it } from "vitest";

import { getPublicationTree } from "@modules/document-tree/application/get-publication-tree";
import type {
  DocumentTreeRepository,
  TreeNodeRecord,
  TreeQuestionRecord,
} from "@modules/document-tree/domain/document-tree-repository";

/**
 * Como uma questão se chama na árvore.
 *
 * O caso que motiva: criar cinco questões seguidas — que é o uso normal — produzia cinco linhas
 * "Sem título", indistinguíveis. Um nome derivado do enunciado resolve sem obrigar a batizar cada
 * questão antes de escrevê-la.
 */

const question = (over: Partial<TreeQuestionRecord> = {}): TreeQuestionRecord => ({
  id: "q1",
  type: "MULTIPLE_CHOICE",
  updatedAt: new Date(0),
  statementLatex: "",
  solutionLatex: "",
  answerLatex: "",
  complementLatex: "",
  difficulty: 5,
  board: null,
  year: null,
  validationStatus: "UNVALIDATED",
  renderJobs: [],
  options: [],
  tags: [],
  ...over,
});

const node = (over: Partial<TreeNodeRecord> = {}): TreeNodeRecord => ({
  id: "n1",
  parentId: null,
  kind: "QUESTION",
  title: null,
  sortKey: "a0",
  numberingStyle: "ARABIC",
  originalLabel: null,
  question: question(),
  ...over,
});

const treeOf = (records: readonly TreeNodeRecord[]) => {
  const repository: DocumentTreeRepository = { listByPublication: async () => records };
  return getPublicationTree(repository, "p1");
};

describe("o nome do nó na árvore", () => {
  it("usa o título quando existe", async () => {
    const [dto] = await treeOf([node({ title: "Questão da prova" })]);
    expect(dto?.title).toBe("Questão da prova");
  });

  it("cai no rótulo original do livro", async () => {
    const [dto] = await treeOf([node({ originalLabel: "27" })]);
    expect(dto?.title).toBe("Questão 27");
  });

  it("nó que não é questão se chama pelo tipo, e não 'Questão N' (D76)", async () => {
    // O item de teoria "1." do Fundamentos aparecia como "Questão 1", e enganava quem revisava.
    const [subsecao, secao] = await treeOf([
      node({ id: "n1", kind: "SUBSECTION", originalLabel: "1", question: null }),
      node({ id: "n2", kind: "SECTION", originalLabel: "IV", question: null, sortKey: "a1" }),
    ]);

    expect(subsecao?.title).toBe("Subseção 1");
    expect(secao?.title).toBe("Seção IV");
  });

  it("deriva do enunciado quando não há título nem rótulo", async () => {
    const [dto] = await treeOf([
      node({ question: question({ statementLatex: "Calcule o valor de $x$ na equação." }) }),
    ]);

    // Sem os comandos e delimitadores: "Calcule o valor de x na equação." e não
    // "Calcule o valor de $x$ na equa\\c{c}ão".
    expect(dto?.title).toBe("Calcule o valor de x na equação.");
  });

  it("trunca enunciado longo", async () => {
    const longo = "Considere a sequência numérica definida pela lei de recorrência a seguir e determine";
    const [dto] = await treeOf([node({ question: question({ statementLatex: longo }) })]);

    expect(dto?.title).toHaveLength(58);
    expect(dto?.title.endsWith("…")).toBe(true);
  });

  it("diz 'Questão nova' enquanto o enunciado está vazio", async () => {
    // O estado que dura os segundos entre criar e escrever. "Sem título" ali seria constatação
    // inútil — o que a linha precisa dizer é que ela é uma questão esperando conteúdo.
    const [dto] = await treeOf([node()]);
    expect(dto?.title).toBe("Questão nova");
  });

  it("nó de estrutura sem título continua 'Sem título'", async () => {
    const [dto] = await treeOf([node({ kind: "SECTION", question: null })]);
    expect(dto?.title).toBe("Sem título");
  });
});

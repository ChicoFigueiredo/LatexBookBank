import { describe, expect, it } from "vitest";

import { getPublicationTree } from "@modules/document-tree/application/get-publication-tree";
import type {
  DocumentTreeRepository,
  TreeNodeRecord,
} from "@modules/document-tree/domain/document-tree-repository";

/**
 * O use case entrega **DTO**, não entidade do Prisma (auditoria §40).
 *
 * O repository é um duplo em memória: o use case não deve precisar de banco para ser testado,
 * e isso é a prova de que a fronteira existe de fato.
 */

const fake = (records: readonly TreeNodeRecord[]): DocumentTreeRepository => ({
  listByPublication: () => Promise.resolve(records),
});

const questionNode: TreeNodeRecord = {
  id: "n1",
  parentId: null,
  kind: "QUESTION",
  title: null,
  sortKey: "a0",
  numberingStyle: "ARABIC",
  originalLabel: "1",
  question: {
    id: "q1",
    type: "MULTIPLE_CHOICE",
    statementLatex: "Qual o montante?",
    difficulty: 2,
    board: "Cesgranrio",
    year: 2014,
    options: [
      { id: "o1", sortKey: "a0", statementLatex: "1020", isCorrect: false },
      { id: "o2", sortKey: "a1", statementLatex: "1120", isCorrect: true },
      { id: "o3", sortKey: "a2", statementLatex: "1200", isCorrect: false },
    ],
  },
};

describe("letra da alternativa é projeção", () => {
  it("deriva da posição, e o DTO não carrega nada parecido com `legacyMarcacao`", async () => {
    const [dto] = await getPublicationTree(fake([questionNode]), "pub");
    const options = dto?.question?.options ?? [];

    expect(options.map((o) => o.label)).toEqual(["a", "b", "c"]);
    // O antipadrão do legado: letra persistida na linha. Não pode chegar aqui.
    expect(Object.keys(options[0] ?? {})).not.toContain("legacyMarcacao");
    expect(Object.keys(options[0] ?? {})).not.toContain("sortKey");
  });

  it("o gabarito segue a alternativa, não a letra", async () => {
    const invertido: TreeNodeRecord = {
      ...questionNode,
      question: {
        ...questionNode.question!,
        // Mesmas alternativas, ordem trocada: a correta passa de "b" para "a".
        options: [
          { id: "o2", sortKey: "a0", statementLatex: "1120", isCorrect: true },
          { id: "o1", sortKey: "a1", statementLatex: "1020", isCorrect: false },
          { id: "o3", sortKey: "a2", statementLatex: "1200", isCorrect: false },
        ],
      },
    };

    const [dto] = await getPublicationTree(fake([invertido]), "pub");
    const correct = dto?.question?.options.find((o) => o.isCorrect);

    expect(correct?.id).toBe("o2");
    expect(correct?.label).toBe("a");
  });
});

describe("o DTO não vaza infraestrutura", () => {
  it("não carrega ids de relação nem timestamps", async () => {
    const [dto] = await getPublicationTree(fake([questionNode]), "pub");
    const keys = Object.keys(dto ?? {});

    for (const forbidden of ["parentId", "sortKey", "publicationId", "createdAt", "legacyId"]) {
      expect(keys, `DTO expõe ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("traduz a escala legada de dificuldade em rótulo legível", async () => {
    const [dto] = await getPublicationTree(fake([questionNode]), "pub");
    // 0·2·5·7·10 é vocabulário interno; a UI não deveria precisar conhecê-lo.
    expect(dto?.question?.difficultyLabel).toBe("Fácil");
  });

  it("compõe a origem a partir de banca e ano", async () => {
    const [dto] = await getPublicationTree(fake([questionNode]), "pub");
    expect(dto?.question?.source).toBe("Cesgranrio · 2014");
  });
});

describe("títulos ausentes", () => {
  it("usa o rótulo original do livro quando não há título", async () => {
    const [dto] = await getPublicationTree(fake([questionNode]), "pub");
    expect(dto?.title).toBe("Questão 1");
  });

  it("cai num marcador neutro quando não há nem rótulo", async () => {
    const semNada: TreeNodeRecord = { ...questionNode, originalLabel: null, question: null };
    const [dto] = await getPublicationTree(fake([semNada]), "pub");
    expect(dto?.title).toBe("Sem título");
  });
});

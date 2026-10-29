import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import type { PrismaQuestionCreator } from "@modules/questions/infrastructure/prisma-question-creator";

import { createTempDatabase } from "./support/temp-database";

// Monta um SQLite com as migrações: sozinho leva um ou dois segundos, e com a suíte inteira em
// paralelo passa dos 5 s padrão.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * Criar questão pelo adaptador real (ARQ-01 da revisão de 2026-09-23).
 *
 * `create-question.test.ts` prova o caso de uso com um dublê; o que o dublê não prova é o que o
 * adaptador grava: o texto e o gabarito de cada alternativa, a banca e o ano herdados, e a âncora
 * de origem na lista do nó **e** nas duas colunas antigas. É a rede para trocar a transação à mão
 * pelo escritor comum de questão, nó e âncora.
 */

let dispose: () => Promise<void>;
let prisma: PrismaClient;
let creator: PrismaQuestionCreator;

beforeAll(async () => {
  const db = await createTempDatabase();
  dispose = db.dispose;

  // Depois do banco: o cliente Prisma lê `DATABASE_URL` ao ser importado.
  ({ prisma } = await import("@infrastructure/database/sqlite/client"));
  const { PrismaQuestionCreator } =
    await import("@modules/questions/infrastructure/prisma-question-creator");
  creator = new PrismaQuestionCreator();
});

afterAll(async () => {
  await dispose();
});

let sequence = 0;

async function livro() {
  sequence += 1;
  const workspace = await prisma.workspace.create({
    data: { name: `Criar ${sequence}`, slug: `criar-${sequence}` },
  });
  const publication = await prisma.publication.create({
    data: { workspaceId: workspace.id, title: `Livro ${sequence}` },
  });
  const pdf = await prisma.asset.create({
    data: {
      workspaceId: workspace.id,
      publicationId: publication.id,
      kind: "SOURCE_PDF",
      storageKey: `k-${sequence}`,
      mimeType: "application/pdf",
      sha256: String(sequence).padStart(64, "0"),
      sizeBytes: 1,
    },
  });
  const anchor = await prisma.sourceAnchor.create({
    data: {
      publicationId: publication.id,
      sourceAssetId: pdf.id,
      pageNumber: 12,
      xNormalized: 0.1,
      yNormalized: 0.2,
      widthNormalized: 0.8,
      heightNormalized: 0.3,
    },
  });
  return { publication, anchor };
}

describe("PrismaQuestionCreator, contra um SQLite com as migrações reais", () => {
  it("grava a questão do candidato: alternativas com texto e gabarito, banca, ano e a origem", async () => {
    const { publication, anchor } = await livro();

    const created = await creator.createQuestionWithNode({
      publicationId: publication.id,
      parentId: null,
      sortKey: "a0",
      title: null,
      originalLabel: "7",
      blueprint: { type: "MULTIPLE_CHOICE", difficulty: 7, optionSortKeys: ["a0", "a1", "a2"] },
      sourceAnchorId: anchor.id,
      statementLatex: "Quanto é $2+2$?",
      solutionLatex: "É $4$.",
      // Duas alternativas para três chaves: a terceira nasce vazia, não quebra.
      options: [
        { statementLatex: "3", isCorrect: false },
        { statementLatex: "4", isCorrect: true },
      ],
      board: "FUVEST",
      year: 2020,
    });

    const node = await prisma.documentNode.findUniqueOrThrow({
      where: { id: created.nodeId },
      include: {
        anchors: true,
        question: { include: { options: { orderBy: { sortKey: "asc" } } } },
      },
    });

    expect(node).toMatchObject({
      publicationId: publication.id,
      parentId: null,
      kind: "QUESTION",
      title: null,
      originalLabel: "7",
      sortKey: "a0",
      questionId: created.questionId,
      sourceAnchorId: anchor.id,
    });
    expect(node.question).toMatchObject({
      type: "MULTIPLE_CHOICE",
      difficulty: 7,
      statementLatex: "Quanto é $2+2$?",
      solutionLatex: "É $4$.",
      board: "FUVEST",
      year: 2020,
      status: "DRAFT",
      validationStatus: "UNVALIDATED",
      sourceAnchorId: anchor.id,
    });
    expect(node.question?.options.map((o) => [o.sortKey, o.statementLatex, o.isCorrect])).toEqual([
      ["a0", "3", false],
      ["a1", "4", true],
      ["a2", "", false],
    ]);
    expect(node.anchors.map((a) => [a.sourceAnchorId, a.sortOrder, a.role])).toEqual([
      [anchor.id, 0, "PRIMARY"],
    ]);
  });

  it("a questão manual nasce sem origem, sem texto e com as alternativas vazias", async () => {
    const { publication } = await livro();

    const created = await creator.createQuestionWithNode({
      publicationId: publication.id,
      parentId: null,
      sortKey: "a0",
      title: "Nova",
      originalLabel: null,
      blueprint: { type: "MULTIPLE_CHOICE", difficulty: 5, optionSortKeys: ["a0", "a1"] },
    });

    const node = await prisma.documentNode.findUniqueOrThrow({
      where: { id: created.nodeId },
      include: {
        anchors: true,
        question: { include: { options: { orderBy: { sortKey: "asc" } } } },
      },
    });

    expect(node.sourceAnchorId).toBeNull();
    expect(node.anchors).toEqual([]);
    expect(node.question).toMatchObject({
      statementLatex: "",
      solutionLatex: "",
      board: null,
      year: null,
      sourceAnchorId: null,
    });
    expect(node.question?.options.map((o) => [o.statementLatex, o.isCorrect])).toEqual([
      ["", false],
      ["", false],
    ]);
  });
});

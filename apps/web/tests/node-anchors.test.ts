import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  appendNodeAnchor,
  InvalidNodeAnchorsError,
  planNodeAnchors,
} from "@modules/assets/domain/node-anchors";

import { createTempDatabase } from "./support/temp-database";

/**
 * As âncoras do nó (D50, ADR 0003) — o aceite da Fase 1 do prompt 03: um nó aponta para duas
 * regiões em duas páginas diferentes.
 */

describe("planNodeAnchors", () => {
  it("numera a ordem e escolhe a principal", () => {
    const plan = planNodeAnchors([
      { sourceAnchorId: "p84", role: "PRIMARY" },
      { sourceAnchorId: "p85", role: "CONTINUATION" },
    ]);

    expect(plan.anchors.map((a) => [a.sourceAnchorId, a.sortOrder])).toEqual([
      ["p84", 0],
      ["p85", 1],
    ]);
    expect(plan.primaryAnchorId).toBe("p84");
  });

  it("sem principal declarada, a primeira da lista responde pela coluna antiga", () => {
    expect(
      planNodeAnchors([
        { sourceAnchorId: "fig", role: "ILLUSTRATION" },
        { sourceAnchorId: "txt", role: "CONTINUATION" },
      ]).primaryAnchorId,
    ).toBe("fig");
  });

  it("lista vazia tira a origem do nó", () => {
    expect(planNodeAnchors([]).primaryAnchorId).toBeNull();
  });

  it("recusa a mesma âncora duas vezes e papel desconhecido", () => {
    expect(() =>
      planNodeAnchors([
        { sourceAnchorId: "a", role: "PRIMARY" },
        { sourceAnchorId: "a", role: "CONTINUATION" },
      ]),
    ).toThrow(InvalidNodeAnchorsError);
    expect(() =>
      planNodeAnchors([{ sourceAnchorId: "a", role: "WHATEVER" as never }]),
    ).toThrow(/Papel/);
  });

  it("acrescentar: a primeira de um nó vazio é principal, e não repete", () => {
    const one = appendNodeAnchor([], "a");
    expect(one).toEqual([{ sourceAnchorId: "a", role: "PRIMARY" }]);
    const two = appendNodeAnchor(one, "b");
    expect(two[1]).toEqual({ sourceAnchorId: "b", role: "CONTINUATION" });
    expect(appendNodeAnchor(two, "a")).toBe(two);
  });
});

describe("PrismaNodeAnchors, contra um SQLite com as migrações reais", () => {
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    const db = await createTempDatabase();
    dispose = db.dispose;
  });

  afterAll(async () => {
    await dispose();
  });

  it("um exercício com duas âncoras em duas páginas, e a coluna antiga em sincronia", async () => {
    const { prisma } = await import("@infrastructure/database/sqlite/client");
    const { PrismaNodeAnchors } = await import(
      "@modules/assets/infrastructure/prisma-node-anchors"
    );
    const { PrismaQuestionCreator } = await import(
      "@modules/questions/infrastructure/prisma-question-creator"
    );

    const workspace = await prisma.workspace.create({ data: { name: "T", slug: "t-anchors" } });
    const publication = await prisma.publication.create({
      data: { workspaceId: workspace.id, title: "Livro C" },
    });
    const pdf = await prisma.asset.create({
      data: {
        workspaceId: workspace.id,
        publicationId: publication.id,
        kind: "SOURCE_PDF",
        storageKey: "k",
        mimeType: "application/pdf",
        sha256: "0".repeat(64),
        sizeBytes: 1,
      },
    });
    const anchor = (pageNumber: number, y: number) =>
      prisma.sourceAnchor.create({
        data: {
          publicationId: publication.id,
          sourceAssetId: pdf.id,
          pageNumber,
          xNormalized: 0.1,
          yNormalized: y,
          widthNormalized: 0.8,
          heightNormalized: 0.2,
        },
      });
    const p84 = await anchor(84, 0.75);
    const p85 = await anchor(85, 0.05);

    const created = await new PrismaQuestionCreator().createQuestionWithNode({
      publicationId: publication.id,
      parentId: null,
      sortKey: "a0",
      title: null,
      originalLabel: "27",
      blueprint: { type: "DISCURSIVE", difficulty: 5, optionSortKeys: [] },
      sourceAnchorId: p84.id,
    });

    const anchors = new PrismaNodeAnchors();
    // Criar a questão já registra a principal na lista.
    expect((await anchors.listForNode(created.nodeId)).map((a) => a.pageNumber)).toEqual([84]);

    await anchors.replace(created.nodeId, [
      { sourceAnchorId: p84.id, role: "PRIMARY" },
      { sourceAnchorId: p85.id, role: "CONTINUATION" },
    ]);

    const viaQuestion = await anchors.listForQuestion(created.questionId);
    expect(viaQuestion.map((a) => [a.pageNumber, a.role, a.box.y])).toEqual([
      [84, "PRIMARY", 0.75],
      [85, "CONTINUATION", 0.05],
    ]);

    // Inverter a ordem move a principal — e as duas colunas antigas vão junto, na mesma transação.
    await anchors.replace(created.nodeId, [
      { sourceAnchorId: p85.id, role: "PRIMARY" },
      { sourceAnchorId: p84.id, role: "CONTINUATION" },
    ]);
    const node = await prisma.documentNode.findUniqueOrThrow({
      where: { id: created.nodeId },
      select: { sourceAnchorId: true, question: { select: { sourceAnchorId: true } } },
    });
    expect(node.sourceAnchorId).toBe(p85.id);
    expect(node.question?.sourceAnchorId).toBe(p85.id);

    // A mesma âncora serve a outro nó sem ser copiada (D29).
    const other = await prisma.documentNode.create({
      data: { publicationId: publication.id, kind: "CONTENT", sortKey: "a1" },
    });
    await anchors.replace(other.id, [{ sourceAnchorId: p85.id, role: "PRIMARY" }]);
    expect(await prisma.sourceAnchor.count()).toBe(2);
  });
});

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createNode,
  DeletedAncestorError,
  deleteNode,
  duplicateNode,
  moveNode,
  restoreNode,
} from "@modules/document-tree/application/mutate-tree";

import type { PrismaClient } from "@/generated/prisma/client";

import { createTempDatabase } from "./support/temp-database";

// Monta um SQLite com as migrações: sozinho leva um ou dois segundos, e com a suíte inteira em
// paralelo passa dos 5 s padrão.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * Os casos de uso da árvore contra o adaptador Prisma e um SQLite com as migrações reais (TST-05
 * da revisão de 2026-09-23).
 *
 * `mutate-tree.test.ts` prova as regras com um dublê em memória, e o dublê não reproduz o que só
 * o banco tem: transação, FK, cascata, o `deletedAt` de cada ato e a cópia de questão,
 * alternativas, tags e âncoras que `duplicateSubtree` faz numa transação de cem linhas. Uma
 * mudança de schema que quebrasse duplicar ou restaurar deixava a suíte verde. Aqui, não.
 */

type Prisma = PrismaClient;

let dispose: () => Promise<void>;
let prisma: Prisma;
let deps: Parameters<typeof createNode>[0];

beforeAll(async () => {
  const db = await createTempDatabase();
  dispose = db.dispose;

  // Depois do banco: o cliente Prisma lê `DATABASE_URL` ao ser importado.
  ({ prisma } = await import("@infrastructure/database/sqlite/client"));
  const { PrismaDocumentTreeRepository } =
    await import("@modules/document-tree/infrastructure/prisma-document-tree-repository");
  const repository = new PrismaDocumentTreeRepository();
  deps = { reader: repository, writer: repository };
});

afterAll(async () => {
  await dispose();
});

let sequence = 0;

/** Uma publicação vazia num workspace próprio: cada teste começa do zero. */
async function novaPublicacao() {
  sequence += 1;
  const workspace = await prisma.workspace.create({
    data: { name: `Árvore ${sequence}`, slug: `arvore-${sequence}` },
  });
  const publication = await prisma.publication.create({
    data: { workspaceId: workspace.id, title: `Livro ${sequence}` },
  });
  return { workspace, publication };
}

/** O que a árvore mostra: título e pai de cada nó vivo, na ordem de leitura. */
async function arvore(publicationId: string) {
  const rows = await deps.reader.listByPublication(publicationId);
  const titleOf = new Map(rows.map((row) => [row.id, row.title]));
  return rows.map((row) => ({
    title: row.title,
    parent: row.parentId === null ? null : (titleOf.get(row.parentId) ?? "?"),
  }));
}

describe("mover", () => {
  it("leva o nó para outro pai e para a posição pedida, e a árvore relida mostra isso", async () => {
    const { publication } = await novaPublicacao();
    const cap1 = await createNode(deps, {
      publicationId: publication.id,
      kind: "CHAPTER",
      title: "Cap 1",
      placement: { kind: "lastChild", parentId: null },
    });
    const cap2 = await createNode(deps, {
      publicationId: publication.id,
      kind: "CHAPTER",
      title: "Cap 2",
      placement: { kind: "lastChild", parentId: null },
    });
    const a = await createNode(deps, {
      publicationId: publication.id,
      kind: "SECTION",
      title: "A",
      placement: { kind: "lastChild", parentId: cap1 },
    });
    await createNode(deps, {
      publicationId: publication.id,
      kind: "SECTION",
      title: "B",
      placement: { kind: "lastChild", parentId: cap2 },
    });

    await moveNode(deps, publication.id, a, { kind: "firstChild", parentId: cap2 });

    const filhosDoCap2 = (await arvore(publication.id)).filter((n) => n.parent === "Cap 2");
    expect(filhosDoCap2.map((n) => n.title)).toEqual(["A", "B"]);
    expect((await arvore(publication.id)).filter((n) => n.parent === "Cap 1")).toEqual([]);
    expect(cap1).not.toBe(cap2);
  });
});

describe("excluir e restaurar", () => {
  async function capituloComSecoes() {
    const { publication } = await novaPublicacao();
    const cap = await createNode(deps, {
      publicationId: publication.id,
      kind: "CHAPTER",
      title: "Cap",
      placement: { kind: "lastChild", parentId: null },
    });
    const sec = await createNode(deps, {
      publicationId: publication.id,
      kind: "SECTION",
      title: "Seção",
      placement: { kind: "lastChild", parentId: cap },
    });
    const sub = await createNode(deps, {
      publicationId: publication.id,
      kind: "SUBSECTION",
      title: "Subseção",
      placement: { kind: "lastChild", parentId: sec },
    });
    return { publication, cap, sec, sub };
  }

  it("excluir tira a subárvore inteira da árvore, num ato só: um `deletedAt` para todos", async () => {
    const { publication, cap, sec, sub } = await capituloComSecoes();

    const excluidos = await deleteNode(deps, publication.id, cap);

    expect([...excluidos].sort()).toEqual([cap, sec, sub].sort());
    expect(await arvore(publication.id)).toEqual([]);

    const lixeira = await deps.writer.listDeleted(publication.id);
    expect(lixeira.map((n) => n.id).sort()).toEqual([cap, sec, sub].sort());
    // A lixeira agrupa os atos pelo instante; o dublê gravava o mesmo instante em toda exclusão,
    // então só o banco prova que uma exclusão é **um** ato.
    expect(new Set(lixeira.map((n) => n.deletedAt.getTime())).size).toBe(1);
  });

  it("restaurar o capítulo traz de volta a descendência excluída junto", async () => {
    const { publication, cap } = await capituloComSecoes();
    await deleteNode(deps, publication.id, cap);

    await restoreNode(deps, publication.id, cap);

    expect(await arvore(publication.id)).toEqual(
      expect.arrayContaining([
        { title: "Cap", parent: null },
        { title: "Seção", parent: "Cap" },
        { title: "Subseção", parent: "Seção" },
      ]),
    );
    expect(await arvore(publication.id)).toHaveLength(3);
    expect(await deps.writer.listDeleted(publication.id)).toEqual([]);
  });

  it("restaurar um filho com o pai na lixeira é recusado, e nada volta", async () => {
    const { publication, cap, sec } = await capituloComSecoes();
    await deleteNode(deps, publication.id, cap);

    await expect(restoreNode(deps, publication.id, sec)).rejects.toThrow(DeletedAncestorError);
    expect(await arvore(publication.id)).toEqual([]);
  });

  it("um capítulo do tamanho de um livro real sai e volta inteiro", async () => {
    // O *Fundamentos* vol. 1 tem 1254 nós. Mais de mil ids numa exclusão é o caso em que o
    // adaptador grava em pedaços (`in-chunks.ts`), dentro de uma transação, com um instante só.
    const { publication } = await novaPublicacao();
    const cap = await prisma.documentNode.create({
      data: { publicationId: publication.id, kind: "CHAPTER", title: "Grande", sortKey: "a0" },
    });
    const total = 1_200;
    await prisma.documentNode.createMany({
      data: Array.from({ length: total }, (_, i) => ({
        publicationId: publication.id,
        parentId: cap.id,
        kind: "SECTION",
        title: `S${i}`,
        sortKey: `a${String(i).padStart(5, "0")}`,
      })),
    });

    expect(await deleteNode(deps, publication.id, cap.id)).toHaveLength(total + 1);
    expect(await arvore(publication.id)).toEqual([]);
    const lixeira = await deps.writer.listDeleted(publication.id);
    expect(new Set(lixeira.map((n) => n.deletedAt.getTime())).size).toBe(1);

    expect(await restoreNode(deps, publication.id, cap.id)).toHaveLength(total + 1);
    expect(await arvore(publication.id)).toHaveLength(total + 1);
  });
});

describe("duplicar", () => {
  /** Um capítulo com uma questão completa: alternativas, tag, âncoras e vínculo com o legado. */
  async function capituloComQuestao() {
    const { workspace, publication } = await novaPublicacao();
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
    const ancora = (pageNumber: number) =>
      prisma.sourceAnchor.create({
        data: {
          publicationId: publication.id,
          sourceAssetId: pdf.id,
          pageNumber,
          xNormalized: 0.1,
          yNormalized: 0.2,
          widthNormalized: 0.8,
          heightNormalized: 0.3,
        },
      });
    const p10 = await ancora(10);
    const p11 = await ancora(11);
    const tag = await prisma.tag.create({ data: { workspaceId: workspace.id, name: "funções" } });

    const question = await prisma.question.create({
      data: {
        type: "MULTIPLE_CHOICE",
        statementLatex: "Quanto é $2+2$?",
        solutionLatex: "É $4$.",
        difficulty: 3,
        board: "FUVEST",
        year: 2020,
        status: "READY",
        validationStatus: "VALID",
        sourceAnchorId: p10.id,
        legacyId: 77,
        options: {
          create: [
            { sortKey: "a0", statementLatex: "3", isCorrect: false, weight: 0.5 },
            { sortKey: "a1", statementLatex: "4", isCorrect: true, weight: 1 },
          ],
        },
        tags: { create: [{ tagId: tag.id }] },
      },
    });

    const cap = await prisma.documentNode.create({
      data: { publicationId: publication.id, kind: "CHAPTER", title: "Cap", sortKey: "a0" },
    });
    await prisma.documentNode.create({
      data: {
        publicationId: publication.id,
        parentId: cap.id,
        kind: "QUESTION",
        sortKey: "a0",
        originalLabel: "27",
        legacyId: 501,
        questionId: question.id,
        sourceAnchorId: p10.id,
        anchors: {
          create: [
            { sourceAnchorId: p10.id, sortOrder: 0, role: "PRIMARY" },
            { sourceAnchorId: p11.id, sortOrder: 1, role: "CONTINUATION" },
          ],
        },
      },
    });

    return { publication, cap: cap.id, question, tag, p10, p11 };
  }

  it("copia a subárvore com a questão, as alternativas, a tag e as âncoras", async () => {
    const { publication, cap, question, tag, p10, p11 } = await capituloComQuestao();

    const copiaId = await duplicateNode(deps, publication.id, cap, {
      kind: "after",
      siblingId: cap,
    });

    // A leitura vem por `sortKey`, que é ordem entre irmãos e não da árvore inteira: compara-se
    // cada nível.
    const nos = await arvore(publication.id);
    expect(nos.filter((n) => n.parent === null).map((n) => n.title)).toEqual([
      "Cap",
      "Cap (cópia)",
    ]);
    expect(nos.filter((n) => n.parent !== null)).toEqual(
      expect.arrayContaining([
        { title: null, parent: "Cap" },
        { title: null, parent: "Cap (cópia)" },
      ]),
    );
    expect(nos).toHaveLength(4);

    const copia = await prisma.documentNode.findFirstOrThrow({
      where: { parentId: copiaId },
      include: {
        anchors: { orderBy: { sortOrder: "asc" } },
        question: { include: { options: { orderBy: { sortKey: "asc" } }, tags: true } },
      },
    });

    expect(copia.questionId).not.toBe(question.id);
    expect(copia.originalLabel).toBe("27");
    expect(copia.sourceAnchorId).toBe(p10.id);
    expect(copia.anchors.map((a) => [a.sourceAnchorId, a.sortOrder, a.role])).toEqual([
      [p10.id, 0, "PRIMARY"],
      [p11.id, 1, "CONTINUATION"],
    ]);

    expect(copia.question).toMatchObject({
      type: "MULTIPLE_CHOICE",
      statementLatex: "Quanto é $2+2$?",
      solutionLatex: "É $4$.",
      difficulty: 3,
      board: "FUVEST",
      year: 2020,
      sourceAnchorId: p10.id,
    });
    expect(copia.question?.options.map((o) => [o.statementLatex, o.isCorrect, o.weight])).toEqual([
      ["3", false, 0.5],
      ["4", true, 1],
    ]);
    expect(copia.question?.tags.map((t) => t.tagId)).toEqual([tag.id]);
  });

  it("a cópia nasce rascunho e não validada, e sem o vínculo com o legado", async () => {
    const { publication, cap } = await capituloComQuestao();

    const copiaId = await duplicateNode(deps, publication.id, cap, {
      kind: "after",
      siblingId: cap,
    });

    const copia = await prisma.documentNode.findFirstOrThrow({
      where: { parentId: copiaId },
      include: { question: true },
    });
    expect(copia.legacyId).toBeNull();
    expect(copia.question).toMatchObject({
      status: "DRAFT",
      validationStatus: "UNVALIDATED",
      legacyId: null,
    });
  });

  it("o original continua intacto: as alternativas da cópia são outras linhas", async () => {
    const { publication, cap, question } = await capituloComQuestao();
    await duplicateNode(deps, publication.id, cap, { kind: "after", siblingId: cap });

    const opcoesDoOriginal = await prisma.questionOption.findMany({
      where: { questionId: question.id },
    });
    expect(opcoesDoOriginal).toHaveLength(2);
  });
});

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ConcurrencyConflictError } from "@/shared/ports/repository";

import { seedBookWithSource } from "./support/scan-seed";
import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * Escrita derivada não é versão nova (#259, ACV-03/ACV-04).
 *
 * `updatedAt` é o token de concorrência da questão e do corpo do nó. O `@updatedAt` do Prisma o
 * avança em **toda** escrita — inclusive nas que não mudam o texto que o editor tem aberto:
 * marcar uma âncora, validar, renomear ou mover o nó. O editor só conhece a versão da resposta
 * do próprio salvamento, e o autosave seguinte batia em 409 sem que ninguém tivesse editado nada.
 *
 * Contra o banco de verdade porque o defeito é do `@updatedAt`, que um dublê não tem.
 */

/** O relógio do SQLite é de milissegundo: sem a pausa, a escrita derivada cairia no mesmo instante. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 15));

async function seed(slug: string) {
  const seeded = await seedBookWithSource("book-c.pdf", slug);
  const { prisma, publication } = seeded;

  const chapter = await prisma.documentNode.create({
    data: { publicationId: publication.id, kind: "CHAPTER", title: "Capítulo 2", sortKey: "a0" },
  });
  const other = await prisma.documentNode.create({
    data: { publicationId: publication.id, kind: "CHAPTER", title: "Capítulo 3", sortKey: "a1" },
  });
  const question = await prisma.question.create({
    data: { type: "DISCURSIVE", statementLatex: "Calcule $x$." },
  });
  await prisma.documentNode.create({
    data: {
      publicationId: publication.id,
      parentId: chapter.id,
      kind: "QUESTION",
      sortKey: "a0",
      questionId: question.id,
    },
  });

  return { ...seeded, chapter, other, question };
}

// Um banco para o arquivo: o cliente Prisma fica no cache de módulos depois do primeiro import.
let dispose: () => Promise<void>;
beforeAll(async () => {
  dispose = (await createTempDatabase()).dispose;
});
afterAll(async () => {
  await dispose();
});

describe("a questão aberta no editor", () => {
  it("marcar uma âncora pelo *Ver fonte* não invalida a versão que o editor tem", async () => {
    const { addQuestionAnchor } = await import("@modules/assets/application/edit-node-anchors");
    const { PrismaNodeAnchors } =
      await import("@modules/assets/infrastructure/prisma-node-anchors");
    const { saveQuestion } = await import("@modules/questions/application/save-question");
    const { PrismaQuestionRepository } =
      await import("@modules/questions/infrastructure/prisma-question-repository");
    const { question } = await seed("ancora");

    await tick();
    await addQuestionAnchor(new PrismaNodeAnchors(), {
      questionId: question.id,
      pageNumber: 1,
      box: { x: 0.1, y: 0.1, width: 0.5, height: 0.2 },
      role: "CONTINUATION",
    });

    await expect(
      saveQuestion(new PrismaQuestionRepository(), {
        questionId: question.id,
        expectedUpdatedAt: question.updatedAt,
        edit: { statementLatex: "Calcule $x^2$." },
      }),
    ).resolves.toMatchObject({ written: true });
  });

  it("clicar em “Validar questão” não invalida a versão que o editor tem", async () => {
    const { validateAndPersist } = await import("@modules/questions/application/validate-question");
    const { PrismaValidationWriter, questionForValidation } =
      await import("@modules/questions/infrastructure/prisma-validation-writer");
    const { saveQuestion } = await import("@modules/questions/application/save-question");
    const { PrismaQuestionRepository } =
      await import("@modules/questions/infrastructure/prisma-question-repository");
    const { prisma, question } = await seed("validar");

    await tick();
    const forPlugin = await questionForValidation(question.id);
    if (!forPlugin) throw new Error("a questão do teste precisa existir");
    // Sem `keepVersion`, como a rota de validação chama.
    await validateAndPersist(new PrismaValidationWriter(), question.id, forPlugin);

    // O veredito foi gravado — o teste não passa por não ter escrito nada.
    const row = await prisma.question.findUniqueOrThrow({ where: { id: question.id } });
    expect(row.validationStatus).not.toBe("UNVALIDATED");

    await expect(
      saveQuestion(new PrismaQuestionRepository(), {
        questionId: question.id,
        expectedUpdatedAt: question.updatedAt,
        edit: { statementLatex: "Calcule $x^2$." },
      }),
    ).resolves.toMatchObject({ written: true });
  });
});

describe("o corpo do nó aberto no editor", () => {
  async function deps() {
    const { PrismaDocumentTreeRepository } =
      await import("@modules/document-tree/infrastructure/prisma-document-tree-repository");
    const repository = new PrismaDocumentTreeRepository();
    return { reader: repository, writer: repository };
  }

  it("renomear o nó na árvore não invalida a versão do corpo", async () => {
    const { renameNode } = await import("@modules/document-tree/application/mutate-tree");
    const { saveNodeBody } = await import("@modules/document-tree/application/save-node-body");
    const { PrismaNodeBodyRepository } =
      await import("@modules/document-tree/infrastructure/prisma-node-body");
    const { publication, chapter, prisma } = await seed("renomear");

    await tick();
    await renameNode(await deps(), publication.id, chapter.id, "Capítulo 2 — Funções");
    expect((await prisma.documentNode.findUniqueOrThrow({ where: { id: chapter.id } })).title).toBe(
      "Capítulo 2 — Funções",
    );

    await expect(
      saveNodeBody(new PrismaNodeBodyRepository(), {
        publicationId: publication.id,
        nodeId: chapter.id,
        expectedUpdatedAt: chapter.updatedAt,
        bodyLatex: "Uma função é…",
      }),
    ).resolves.toMatchObject({ written: true });
  });

  it("mover o nó na árvore não invalida a versão do corpo", async () => {
    const { moveNode } = await import("@modules/document-tree/application/mutate-tree");
    const { saveNodeBody } = await import("@modules/document-tree/application/save-node-body");
    const { PrismaNodeBodyRepository } =
      await import("@modules/document-tree/infrastructure/prisma-node-body");
    const { publication, chapter, other } = await seed("mover");

    await tick();
    await moveNode(await deps(), publication.id, chapter.id, {
      kind: "after",
      siblingId: other.id,
    });

    await expect(
      saveNodeBody(new PrismaNodeBodyRepository(), {
        publicationId: publication.id,
        nodeId: chapter.id,
        expectedUpdatedAt: chapter.updatedAt,
        bodyLatex: "Uma função é…",
      }),
    ).resolves.toMatchObject({ written: true });
  });

  it("duas abas salvando o mesmo corpo ao mesmo tempo: uma grava, a outra recebe conflito", async () => {
    const { saveNodeBody } = await import("@modules/document-tree/application/save-node-body");
    const { PrismaNodeBodyRepository } =
      await import("@modules/document-tree/infrastructure/prisma-node-body");
    const { publication, chapter, prisma } = await seed("duas-abas");

    const repository = new PrismaNodeBodyRepository();
    const salvar = (bodyLatex: string) =>
      saveNodeBody(repository, {
        publicationId: publication.id,
        nodeId: chapter.id,
        expectedUpdatedAt: chapter.updatedAt,
        bodyLatex,
      });

    const [a, b] = await Promise.allSettled([salvar("texto da aba A"), salvar("texto da aba B")]);
    const gravou = [a, b].filter((result) => result.status === "fulfilled");
    const recusou = [a, b].filter((result) => result.status === "rejected");

    expect(gravou).toHaveLength(1);
    expect(recusou).toHaveLength(1);
    expect((recusou[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConcurrencyConflictError);

    // O que ficou no banco é o da aba que gravou — e só uma revisão, a do estado anterior.
    const row = await prisma.documentNode.findUniqueOrThrow({ where: { id: chapter.id } });
    const vencedor = a.status === "fulfilled" ? "texto da aba A" : "texto da aba B";
    expect(row.bodyLatex).toBe(vencedor);
    expect(
      await prisma.revision.count({ where: { entityType: "DOCUMENT_NODE", entityId: chapter.id } }),
    ).toBe(1);
  });
});

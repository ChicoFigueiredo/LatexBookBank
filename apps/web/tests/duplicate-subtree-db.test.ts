import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { duplicateNode } from "@modules/document-tree/application/mutate-tree";

import { createTempDatabase } from "./support/temp-database";

/**
 * Duplicar uma subárvore contra o banco de verdade (#252, SPG-08).
 *
 * O plano da cópia está no contrato da árvore (`tree-contract.test.ts`); o que só o repositório
 * decide é **o que** vai para a cópia. O corpo do nó é a teoria da seção e o texto inteiro do
 * exemplo (D56): a cópia sem ele é um galho vazio.
 */

let dispose: () => Promise<void>;
beforeAll(async () => {
  dispose = (await createTempDatabase()).dispose;
});
afterAll(async () => {
  await dispose();
});

describe("duplicar subárvore", () => {
  it("a cópia leva o corpo: a teoria da seção e o texto do exemplo", async () => {
    const { prisma } = await import("@infrastructure/database/sqlite/client");
    const { PrismaDocumentTreeRepository } =
      await import("@modules/document-tree/infrastructure/prisma-document-tree-repository");
    const workspace = await prisma.workspace.create({ data: { name: "dup", slug: "dup" } });
    const publication = await prisma.publication.create({
      data: { workspaceId: workspace.id, title: "Livro" },
    });
    const secao = await prisma.documentNode.create({
      data: {
        publicationId: publication.id,
        kind: "SECTION",
        title: "Funções",
        sortKey: "a0",
        bodyLatex: "Uma função associa cada $x$ a um único $y$.",
      },
    });
    await prisma.documentNode.create({
      data: {
        publicationId: publication.id,
        parentId: secao.id,
        kind: "EXAMPLE",
        title: "A função f(x) = 3x é linear",
        sortKey: "a0",
        bodyLatex: "A função $f(x) = 3x$ é linear, pois $f(a + b) = f(a) + f(b)$.",
      },
    });

    const repository = new PrismaDocumentTreeRepository();
    const copiaId = await duplicateNode(
      { reader: repository, writer: repository },
      publication.id,
      secao.id,
      { kind: "after", siblingId: secao.id },
    );

    const copia = await prisma.documentNode.findUniqueOrThrow({
      where: { id: copiaId },
      select: { bodyLatex: true, children: { select: { kind: true, bodyLatex: true } } },
    });
    expect(copia.bodyLatex).toBe("Uma função associa cada $x$ a um único $y$.");
    expect(copia.children).toEqual([
      {
        kind: "EXAMPLE",
        bodyLatex: "A função $f(x) = 3x$ é linear, pois $f(a + b) = f(a) + f(b)$.",
      },
    ]);
  });
});

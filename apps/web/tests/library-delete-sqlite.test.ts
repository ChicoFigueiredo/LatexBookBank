import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import type { StorageKey, StorageProvider } from "@/shared/ports";
// Só o tipo: o valor vem por `import()` depois do banco, porque o cliente Prisma lê
// `DATABASE_URL` ao ser importado.
import type { PrismaLibraryRepository } from "@modules/workspaces/infrastructure/prisma-library-repository";
import { deleteLibrary } from "@modules/workspaces/application/manage-libraries";

import { createTempDatabase } from "./support/temp-database";

// Monta um SQLite com as migrações: sozinho leva um ou dois segundos, e com a suíte inteira em
// paralelo passa dos 5 s padrão.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * Excluir uma biblioteca de verdade, contra o `PrismaLibraryRepository` e um SQLite com as
 * migrações reais (TST-05 da revisão de 2026-09-23).
 *
 * O dublê de `manage-libraries.test.ts` não tem FK. O banco tem três arestas `RESTRICT` no caminho
 * — a questão numa avaliação, a âncora presa ao PDF fonte, a varredura presa ao PDF fonte — e foi
 * por elas que a exclusão devolveu `P2003` contra o banco de desenvolvimento. Uma biblioteca com as
 * três ao mesmo tempo é o caso que o dublê nunca reproduziria.
 */

let dispose: () => Promise<void>;
let prisma: PrismaClient;
let repository: PrismaLibraryRepository;

/** O storage não importa aqui: a exclusão dos arquivos é melhor-esforço e vem depois do banco. */
const storage = {
  delete: async (_key: StorageKey) => undefined,
} as unknown as StorageProvider;

beforeAll(async () => {
  const db = await createTempDatabase();
  dispose = db.dispose;

  ({ prisma } = await import("@infrastructure/database/sqlite/client"));
  const { PrismaLibraryRepository } =
    await import("@modules/workspaces/infrastructure/prisma-library-repository");
  repository = new PrismaLibraryRepository();
});

afterAll(async () => {
  await dispose();
});

/** Uma biblioteca com tudo o que trava a cascata: avaliação, âncora e varredura sobre o PDF. */
async function bibliotecaCheia(slug: string) {
  const workspace = await prisma.workspace.create({ data: { name: `Acervo ${slug}`, slug } });
  const publication = await prisma.publication.create({
    data: { workspaceId: workspace.id, title: "Livro" },
  });
  const pdf = await prisma.asset.create({
    data: {
      workspaceId: workspace.id,
      publicationId: publication.id,
      kind: "SOURCE_PDF",
      storageKey: `${slug}/fonte.pdf`,
      mimeType: "application/pdf",
      sha256: "0".repeat(64),
      sizeBytes: 1,
    },
  });
  const ancora = await prisma.sourceAnchor.create({
    data: {
      publicationId: publication.id,
      sourceAssetId: pdf.id,
      pageNumber: 1,
      xNormalized: 0,
      yNormalized: 0,
      widthNormalized: 1,
      heightNormalized: 1,
    },
  });
  const question = await prisma.question.create({
    data: {
      type: "MULTIPLE_CHOICE",
      sourceAnchorId: ancora.id,
      options: { create: [{ sortKey: "a0", statementLatex: "4", isCorrect: true }] },
    },
  });
  await prisma.documentNode.create({
    data: {
      publicationId: publication.id,
      kind: "QUESTION",
      sortKey: "a0",
      questionId: question.id,
      sourceAnchorId: ancora.id,
    },
  });
  await prisma.assessment.create({
    data: {
      workspaceId: workspace.id,
      title: "Prova 1",
      sections: {
        create: [
          { sortKey: "a0", items: { create: [{ questionId: question.id, sortKey: "a0" }] } },
        ],
      },
    },
  });
  await prisma.scanRun.create({
    data: {
      workspaceId: workspace.id,
      publicationId: publication.id,
      sourceAssetId: pdf.id,
      profileId: "book-v1",
      profileVersion: 1,
      engineVersion: "teste",
      settingsJson: "{}",
      runKey: `${slug}-run`,
      pageFrom: 1,
      pageTo: 1,
    },
  });
  return { workspace, question };
}

describe("excluir uma biblioteca", () => {
  it("sai inteira, mesmo com avaliação, âncora e varredura presas ao PDF fonte", async () => {
    const { workspace, question } = await bibliotecaCheia("cheia");

    const apagado = await deleteLibrary(repository, storage, workspace.id, {
      name: "Acervo cheia",
    });

    expect(apagado).toMatchObject({ publicationCount: 1, questionCount: 1, assetCount: 1 });
    expect(await prisma.workspace.findUnique({ where: { id: workspace.id } })).toBeNull();
    // A questão não pende do workspace — só o nó aponta para ela. Sem o passo explícito, ela
    // ficaria órfã no banco, invisível e pesando no arquivo.
    expect(await prisma.question.findUnique({ where: { id: question.id } })).toBeNull();
    expect(await prisma.questionOption.count({ where: { questionId: question.id } })).toBe(0);
  });

  it("não toca a biblioteca vizinha", async () => {
    const alvo = await bibliotecaCheia("alvo");
    const vizinha = await bibliotecaCheia("vizinha");

    await deleteLibrary(repository, storage, alvo.workspace.id, { name: "Acervo alvo" });

    expect(
      await prisma.workspace.findUnique({ where: { id: vizinha.workspace.id } }),
    ).not.toBeNull();
    expect(await prisma.question.findUnique({ where: { id: vizinha.question.id } })).not.toBeNull();
    expect(await prisma.assessment.count({ where: { workspaceId: vizinha.workspace.id } })).toBe(1);
  });
});

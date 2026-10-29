import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { asStorageKey } from "@/shared/ports";

import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * Esvaziar a lixeira com uma questão que está numa avaliação (#258, ACV-02/STE-04/TST-03).
 *
 * `AssessmentItem → Question` é `ON DELETE RESTRICT`: a prova referencia a questão, nunca a copia.
 * Esvaziar mandava `question.deleteMany` sobre ela, a FK abortava a transação inteira, e a lixeira
 * respondia 500 sem apagar nada — nem os outros itens, que não tinham nada com a prova.
 *
 * Contra o banco de verdade porque a regra é do banco: um dublê não teria a FK.
 */

async function seed() {
  const { prisma } = await import("@infrastructure/database/sqlite/client");
  const { LocalFileStorageProvider } =
    await import("@infrastructure/storage/local/local-file-storage-provider");

  const storage = new LocalFileStorageProvider({
    rootDir: mkdtempSync(path.join(tmpdir(), "lbb-test-storage-")),
  });
  const slug = `ws-${Math.random().toString(36).slice(2, 8)}`;
  const workspace = await prisma.workspace.create({ data: { name: slug, slug } });
  const publication = await prisma.publication.create({
    data: { workspaceId: workspace.id, title: "FME 1" },
  });
  const deletedAt = new Date("2026-10-01T10:00:00Z");

  const chapter = await prisma.documentNode.create({
    data: {
      publicationId: publication.id,
      kind: "CHAPTER",
      title: "Capítulo 2",
      sortKey: "a0",
      deletedAt,
    },
  });
  const naProva = await prisma.question.create({ data: { type: "DISCURSIVE", nickname: "PA" } });
  const solta = await prisma.question.create({ data: { type: "DISCURSIVE" } });
  const noNaProva = await prisma.documentNode.create({
    data: {
      publicationId: publication.id,
      parentId: chapter.id,
      kind: "QUESTION",
      originalLabel: "7",
      sortKey: "a0",
      questionId: naProva.id,
      deletedAt,
    },
  });
  const noSolto = await prisma.documentNode.create({
    data: {
      publicationId: publication.id,
      parentId: chapter.id,
      kind: "QUESTION",
      originalLabel: "8",
      sortKey: "a1",
      questionId: solta.id,
      deletedAt,
    },
  });
  const outroAto = await prisma.documentNode.create({
    data: {
      publicationId: publication.id,
      kind: "SECTION",
      title: "Rascunho",
      sortKey: "a1",
      deletedAt,
    },
  });

  const assessment = await prisma.assessment.create({
    data: { workspaceId: workspace.id, title: "Prova do 2º bimestre" },
  });
  const section = await prisma.assessmentSection.create({
    data: { assessmentId: assessment.id, sortKey: "a0" },
  });
  await prisma.assessmentItem.create({
    data: { sectionId: section.id, questionId: naProva.id, sortKey: "a0" },
  });

  return {
    prisma,
    storage,
    workspace,
    chapter,
    naProva,
    solta,
    noNaProva,
    noSolto,
    outroAto,
  };
}

describe("esvaziar a lixeira com uma questão numa avaliação", () => {
  let dispose: () => Promise<void>;
  beforeAll(async () => {
    dispose = (await createTempDatabase()).dispose;
  });
  afterAll(async () => {
    await dispose();
  });

  it("apaga o resto e deixa na lixeira a questão que a prova usa, dizendo qual prova", async () => {
    const { emptyTrash } = await import("@modules/document-tree/application/empty-trash");
    const { PrismaTrashPurge } =
      await import("@modules/document-tree/infrastructure/prisma-global-trash");
    const s = await seed();

    const result = await emptyTrash(new PrismaTrashPurge(), s.storage);

    // A questão solta e a seção de outro ato saíram; a da prova ficou.
    expect(await s.prisma.question.count({ where: { id: s.solta.id } })).toBe(0);
    expect(
      await s.prisma.documentNode.count({ where: { id: { in: [s.noSolto.id, s.outroAto.id] } } }),
    ).toBe(0);
    expect(await s.prisma.question.count({ where: { id: s.naProva.id } })).toBe(1);

    // Ficou **na lixeira**, e com o capítulo em volta: restaurar o capítulo ainda a devolve ao lugar.
    const preso = await s.prisma.documentNode.findUniqueOrThrow({ where: { id: s.noNaProva.id } });
    expect(preso.deletedAt).not.toBeNull();
    expect(preso.parentId).toBe(s.chapter.id);
    const capitulo = await s.prisma.documentNode.findUniqueOrThrow({ where: { id: s.chapter.id } });
    expect(capitulo.deletedAt).not.toBeNull();

    expect(result.deleted).toEqual({ nodes: 2, questions: 1 });
    expect(result.held).toEqual([
      { nodeId: s.noNaProva.id, title: "Questão 7 · PA", assessments: ["Prova do 2º bimestre"] },
    ]);
  });

  it("o arquivo de render da questão apagada sai do disco", async () => {
    const { emptyTrash } = await import("@modules/document-tree/application/empty-trash");
    const { PrismaTrashPurge } =
      await import("@modules/document-tree/infrastructure/prisma-global-trash");
    const s = await seed();

    // O render da questão solta: o job e a linha do asset saem em cascata com a questão, e o
    // arquivo ficava no disco sem nenhuma linha que o citasse.
    const job = await s.prisma.renderJob.create({
      data: {
        workspaceId: s.workspace.id,
        questionId: s.solta.id,
        contentHash: `hash-${s.solta.id}`,
        profileId: "default",
        rendererVersion: "1",
        state: "DONE",
        success: true,
      },
    });
    const stored = await s.storage.put({
      workspaceId: s.workspace.id,
      content: new TextEncoder().encode(`%PDF render de ${s.solta.id}`),
      mimeType: "application/pdf",
      originalFilename: "render.pdf",
    });
    await s.prisma.asset.create({
      data: {
        workspaceId: s.workspace.id,
        renderJobId: job.id,
        kind: "RENDER_PDF",
        storageKey: stored.storageKey,
        mimeType: "application/pdf",
        sha256: stored.sha256,
        sizeBytes: stored.sizeBytes,
      },
    });

    await emptyTrash(new PrismaTrashPurge(), s.storage);

    expect(await s.storage.exists(asStorageKey(stored.storageKey))).toBe(false);
  });
});

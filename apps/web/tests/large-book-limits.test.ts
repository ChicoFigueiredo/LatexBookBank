import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { ScanRunner } from "@modules/scan/application/scan-store";

import { seedBookWithSource } from "./support/scan-seed";
import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

/**
 * Um livro do tamanho de um livro (P2029 do Prisma).
 *
 * O adaptador libSQL recusa consulta com mais de 999 parâmetros, e as listas `in` montadas com os
 * ids de um livro inteiro passam disso: o *Fundamentos* vol. 1 importado tem 1254 nós, 929 questões
 * e 941 recortes. Na experimentação de 2026-09-30, a conferência de "Apagar importação" quebrou com
 * 500 — e os testes, com livros de vinte nós, nunca passavam perto do limite.
 */

const sha256 = async (text: string) => createHash("sha256").update(text).digest("hex");
const idle: ScanRunner = { ensure: () => undefined, isRunning: () => false };

/** Mais que o limite, com folga para os outros parâmetros da consulta. */
const MUITOS = 1100;

describe("livro grande", () => {
  let dispose: () => Promise<void>;
  beforeAll(async () => {
    dispose = (await createTempDatabase()).dispose;
  });
  afterAll(async () => {
    await dispose();
  });

  /** Uma importação de verdade do livro de teste, engordada com nós da mesma execução. */
  async function importacaoGrande(slug: string) {
    const seeded = await seedBookWithSource("book-a.pdf", slug);
    const { PrismaScanStore, PrismaScanSources, storageKeyOfAsset } =
      await import("@modules/scan/infrastructure/prisma-scan-store");
    const { PdfjsDocumentReader } =
      await import("@modules/scan/infrastructure/pdfjs-document-reader");
    const { PrismaScanApproval } =
      await import("@modules/scan/infrastructure/prisma-scan-approval");
    const { startScan } = await import("@modules/scan/application/start-scan");
    const { runScan } = await import("@modules/scan/application/run-scan");
    const { approveScan } = await import("@modules/scan/application/approve-scan");
    const { generateNKeysBetween } = await import("@/shared/ordering/fractional-index");

    const store = new PrismaScanStore();
    const { run } = await startScan(
      { store, runner: idle, sources: new PrismaScanSources(), sha256 },
      { publicationId: seeded.publication.id, profileId: "book-v1", recognizeMath: "never" },
    );
    await runScan(
      {
        store,
        storage: seeded.storage,
        opener: new PdfjsDocumentReader(),
        sourceKey: storageKeyOfAsset,
      },
      run.id,
    );
    await approveScan(
      { store, writer: new PrismaScanApproval() },
      { runId: run.id, destinationId: null, includeSuggested: true },
    );

    const keys = generateNKeysBetween(null, null, MUITOS);
    await seeded.prisma.documentNode.createMany({
      data: keys.map((sortKey, index) => ({
        publicationId: seeded.publication.id,
        kind: "SECTION",
        title: `Seção ${index}`,
        sortKey,
        createdByScanRunId: run.id,
      })),
    });

    return { ...seeded, store, runId: run.id };
  }

  it("apagar a importação de um livro grande confere e manda tudo para a lixeira", async () => {
    const { previewImportRemoval, removeImport } =
      await import("@modules/scan/application/remove-import");
    const { PrismaScanImport } = await import("@modules/scan/infrastructure/prisma-scan-import");
    const { prisma, publication, store, runId } = await importacaoGrande("grande-remover");
    const imports = new PrismaScanImport();

    const preview = await previewImportRemoval({ store, imports }, runId);
    expect(preview.trash.length).toBeGreaterThan(MUITOS);

    await removeImport({ store, imports }, { runId, scope: "import" });
    expect(
      await prisma.documentNode.count({
        where: { publicationId: publication.id, deletedAt: null },
      }),
    ).toBe(0);
  });

  it("esvaziar uma lixeira com mais de mil nós apaga todos", async () => {
    const { PrismaTrashPurge } =
      await import("@modules/document-tree/infrastructure/prisma-global-trash");
    const { prisma } = await import("@infrastructure/database/sqlite/client");

    // A lixeira do teste anterior já passa de mil nós.
    expect(
      await prisma.documentNode.count({ where: { deletedAt: { not: null } } }),
    ).toBeGreaterThan(MUITOS);

    await new PrismaTrashPurge().purge();
    expect(await prisma.documentNode.count({ where: { deletedAt: { not: null } } })).toBe(0);
  });

  it("excluir um livro com mais de mil questões e recortes apaga tudo, e só os arquivos dele", async () => {
    const { deletePublication } =
      await import("@modules/publications/application/manage-publications");
    const { PrismaPublicationRepository } =
      await import("@modules/publications/infrastructure/prisma-publication-repository");
    const { prisma, storage, workspace, publication } = await seedBookWithSource(
      "book-c.pdf",
      "grande-excluir",
    );
    const { generateNKeysBetween } = await import("@/shared/ordering/fractional-index");

    const keys = generateNKeysBetween(null, null, MUITOS);
    for (const [index, sortKey] of keys.entries()) {
      const question = await prisma.question.create({
        data: { type: "DISCURSIVE", statementLatex: `Q${index}` },
        select: { id: true },
      });
      await prisma.documentNode.create({
        data: { publicationId: publication.id, kind: "QUESTION", sortKey, questionId: question.id },
      });
    }
    const recortes = await Promise.all(
      Array.from({ length: MUITOS }, (_, index) =>
        storage.put({
          workspaceId: workspace.id,
          content: new TextEncoder().encode(`recorte ${index}`),
          mimeType: "image/png",
        }),
      ),
    );
    await prisma.asset.createMany({
      data: recortes.map((stored) => ({
        workspaceId: workspace.id,
        publicationId: publication.id,
        kind: "CROP",
        storageKey: stored.storageKey,
        mimeType: "image/png",
        sha256: stored.sha256,
        sizeBytes: stored.sizeBytes,
      })),
    });

    await deletePublication(new PrismaPublicationRepository(), storage, publication.id, {
      title: publication.title,
    });

    expect(await prisma.question.count({ where: { statementLatex: { startsWith: "Q" } } })).toBe(0);
    expect(await prisma.asset.count({ where: { workspaceId: workspace.id } })).toBe(0);
    expect(await storage.exists(recortes[0]!.storageKey)).toBe(false);
  });
});

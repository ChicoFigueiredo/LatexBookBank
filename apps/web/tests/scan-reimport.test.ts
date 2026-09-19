import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { ScanRunner } from "@modules/scan/application/scan-store";

import { createTempDatabase } from "./support/temp-database";
import { seedBookWithSource } from "./support/scan-seed";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * Reimportar (Fase 23 · D57 · ADR 0006): apagar o que uma varredura deixou e varrer de novo.
 *
 * O ciclo inteiro contra o banco, porque é nele que a promessa vale ou não vale: o que a
 * importação criou vai para a **lixeira** — de onde dá para voltar —, e o que a pessoa editou
 * depois de aprovar **fica de pé**. Um teste de unidade prova a regra; só o banco prova que a
 * regra chegou ao acervo.
 */

const sha256 = async (text: string) => createHash("sha256").update(text).digest("hex");
const idle: ScanRunner = { ensure: () => undefined, isRunning: () => false };

describe("reimportar", () => {
  let dispose: () => Promise<void>;
  beforeAll(async () => {
    dispose = (await createTempDatabase()).dispose;
  });
  afterAll(async () => {
    await dispose();
  });

  async function importado(slug: string) {
    const seeded = await seedBookWithSource("book-a.pdf", slug);
    const { PrismaScanStore, PrismaScanSources, storageKeyOfAsset } = await import("@modules/scan/infrastructure/prisma-scan-store");
    const { PdfjsDocumentReader } = await import("@modules/scan/infrastructure/pdfjs-document-reader");
    const { PrismaScanApproval } = await import("@modules/scan/infrastructure/prisma-scan-approval");
    const { PrismaScanImport } = await import("@modules/scan/infrastructure/prisma-scan-import");
    const { startScan } = await import("@modules/scan/application/start-scan");
    const { runScan } = await import("@modules/scan/application/run-scan");
    const { reviewScan } = await import("@modules/scan/application/review-scan");
    const { approveScan } = await import("@modules/scan/application/approve-scan");

    const store = new PrismaScanStore();
    const { run } = await startScan(
      { store, runner: idle, sources: new PrismaScanSources(), sha256 },
      { publicationId: seeded.publication.id, profileId: "book-v1", recognizeMath: "never" },
    );
    await runScan(
      { store, storage: seeded.storage, opener: new PdfjsDocumentReader(), sourceKey: storageKeyOfAsset },
      run.id,
    );
    await reviewScan({ store, newId: () => crypto.randomUUID() }, run.id, { type: "acceptSuggested" });
    await approveScan(
      { store, writer: new PrismaScanApproval() },
      { runId: run.id, destinationId: null, includeSuggested: false },
    );

    return { ...seeded, store, runId: run.id, imports: new PrismaScanImport() };
  }

  /** Varre e para: a proposta existe, o acervo não foi tocado. */
  async function varrido(slug: string) {
    const seeded = await seedBookWithSource("book-a.pdf", slug);
    const { PrismaScanStore, PrismaScanSources, storageKeyOfAsset } = await import("@modules/scan/infrastructure/prisma-scan-store");
    const { PdfjsDocumentReader } = await import("@modules/scan/infrastructure/pdfjs-document-reader");
    const { PrismaScanImport } = await import("@modules/scan/infrastructure/prisma-scan-import");
    const { startScan } = await import("@modules/scan/application/start-scan");
    const { runScan } = await import("@modules/scan/application/run-scan");

    const store = new PrismaScanStore();
    const { run } = await startScan(
      { store, runner: idle, sources: new PrismaScanSources(), sha256 },
      { publicationId: seeded.publication.id, profileId: "book-v1", recognizeMath: "never" },
    );
    await runScan(
      { store, storage: seeded.storage, opener: new PdfjsDocumentReader(), sourceKey: storageKeyOfAsset },
      run.id,
    );
    return { ...seeded, store, runId: run.id, imports: new PrismaScanImport() };
  }

  it("cada nó criado sabe de que varredura veio", async () => {
    const { prisma, publication, runId } = await importado("reimport-a");

    const nodes = await prisma.documentNode.findMany({
      where: { publicationId: publication.id },
      select: { createdByScanRunId: true },
    });
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.every((node) => node.createdByScanRunId === runId)).toBe(true);
  });

  it("apagar só a proposta, antes de aprovar, não toca no acervo", async () => {
    const { prisma, publication, store, runId, imports } = await varrido("reimport-b");
    const { removeImport } = await import("@modules/scan/application/remove-import");

    const antes = await prisma.documentNode.count({ where: { publicationId: publication.id, deletedAt: null } });
    const resultado = await removeImport({ store, imports }, { runId, scope: "proposal" });

    expect(resultado).toMatchObject({ scope: "proposal", trashed: 0 });
    expect(await store.findRun(runId)).toBeNull();
    expect(await prisma.scanPage.count({ where: { runId } })).toBe(0);
    expect(await prisma.documentNode.count({ where: { publicationId: publication.id, deletedAt: null } })).toBe(antes);
  });

  it("depois de aprovada, apagar só a proposta é recusado — cegaria a importação", async () => {
    // Sem a execução não há como achar o que ela criou: a importação ficaria no acervo para
    // sempre, e a tela promete o contrário.
    const { store, runId, imports } = await importado("reimport-b2");
    const { removeImport } = await import("@modules/scan/application/remove-import");

    await expect(removeImport({ store, imports }, { runId, scope: "proposal" })).rejects.toThrow(/importação inteira/);
    expect(await store.findRun(runId)).not.toBeNull();
  });

  it("apagar a importação manda para a lixeira o que ela criou, e preserva o que foi editado", async () => {
    const { prisma, publication, store, runId, imports } = await importado("reimport-c");
    const { previewImportRemoval, removeImport } = await import("@modules/scan/application/remove-import");

    // Alguém conferiu uma questão e reescreveu o enunciado de outra — o trabalho que não pode sumir.
    const questoes = await prisma.documentNode.findMany({
      where: { publicationId: publication.id, kind: "QUESTION" },
      select: { id: true, questionId: true, title: true },
      orderBy: { sortKey: "asc" },
    });
    const conferida = questoes[0]!;
    const reescrita = questoes[1]!;
    await prisma.question.update({ where: { id: conferida.questionId! }, data: { status: "READY" } });
    await prisma.question.update({
      where: { id: reescrita.questionId! },
      data: { statementLatex: "Reescrito à mão.", updatedAt: new Date(Date.now() + 60 * 60 * 1000) },
    });

    // A conferência vem antes de apagar: é o que a confirmação mostra.
    const preview = await previewImportRemoval({ store, imports }, runId);
    expect(preview.created).toBeGreaterThan(preview.trash.length);
    expect(preview.keptRows.map((row) => row.reason)).toContain("conferida");
    expect(preview.keptRows.map((row) => row.reason)).toContain("editado depois de aprovado");
    // O pai de quem fica, fica — senão o filho iria junto para a lixeira.
    expect(preview.keptRows.map((row) => row.reason)).toContain("contém trabalho preservado");

    const resultado = await removeImport({ store, imports }, { runId, scope: "import" });
    expect(resultado.scope).toBe("import");
    // Não basta bater com o plano: o plano vazio bateria também. Algo tem de ter ido embora.
    expect(resultado.trashed).toBeGreaterThan(0);
    expect(resultado.trashed).toBe(preview.trash.length);
    expect(resultado.kept).toBeGreaterThanOrEqual(3);

    const vivos = await prisma.documentNode.findMany({
      where: { publicationId: publication.id, deletedAt: null },
      select: { id: true, kind: true },
    });
    const vivosIds = new Set(vivos.map((node) => node.id));
    expect(vivosIds.has(conferida.id)).toBe(true);
    expect(vivosIds.has(reescrita.id)).toBe(true);
    expect(vivos.length).toBe(preview.keptCount);

    // Lixeira, e não sumiço: o texto continua lá, esperando restaurar.
    const naLixeira = await prisma.documentNode.findMany({
      where: { publicationId: publication.id, deletedAt: { not: null } },
      select: { id: true },
    });
    expect(naLixeira.length).toBe(preview.trash.length);

    // E a varredura sai junto — um livro, uma importação.
    expect(await store.findRun(runId)).toBeNull();
  });

  it("varrer de novo depois de apagar entrega o livro outra vez", async () => {
    const { prisma, publication, storage, store, runId, imports } = await importado("reimport-d");
    const { removeImport } = await import("@modules/scan/application/remove-import");
    const { PrismaScanSources, storageKeyOfAsset } = await import("@modules/scan/infrastructure/prisma-scan-store");
    const { PdfjsDocumentReader } = await import("@modules/scan/infrastructure/pdfjs-document-reader");
    const { PrismaScanApproval } = await import("@modules/scan/infrastructure/prisma-scan-approval");
    const { startScan } = await import("@modules/scan/application/start-scan");
    const { runScan } = await import("@modules/scan/application/run-scan");
    const { reviewScan } = await import("@modules/scan/application/review-scan");
    const { approveScan } = await import("@modules/scan/application/approve-scan");

    const antes = await prisma.documentNode.count({ where: { publicationId: publication.id, deletedAt: null } });
    await removeImport({ store, imports }, { runId, scope: "import" });

    // A mesma chave de execução, de novo: sem o `forceNew`, e sem a execução antiga no caminho.
    const { run } = await startScan(
      { store, runner: idle, sources: new PrismaScanSources(), sha256 },
      { publicationId: publication.id, profileId: "book-v1", recognizeMath: "never" },
    );
    expect(run.id).not.toBe(runId);
    await runScan(
      { store, storage, opener: new PdfjsDocumentReader(), sourceKey: storageKeyOfAsset },
      run.id,
    );
    await reviewScan({ store, newId: () => crypto.randomUUID() }, run.id, { type: "acceptSuggested" });
    await approveScan(
      { store, writer: new PrismaScanApproval() },
      { runId: run.id, destinationId: null, includeSuggested: false },
    );

    const depois = await prisma.documentNode.count({
      where: { publicationId: publication.id, deletedAt: null, createdByScanRunId: run.id },
    });
    expect(depois).toBe(antes);
  });
});

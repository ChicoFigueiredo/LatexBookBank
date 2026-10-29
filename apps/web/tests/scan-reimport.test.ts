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

  it("aprovar em duas sessões não faz a segunda parecer edição à mão (#249, SPG-05)", async () => {
    // Hoje a estrutura, amanhã a teoria: a segunda aprovação grava o corpo das seções criadas na
    // primeira. Medido da criação do nó, isso era "editado depois de aprovado", e apagar a
    // importação deixava meio livro de pé.
    const seeded = await seedBookWithSource("book-a.pdf", "reimport-two-sessions");
    const { PrismaScanStore, PrismaScanSources, storageKeyOfAsset } = await import("@modules/scan/infrastructure/prisma-scan-store");
    const { PdfjsDocumentReader } = await import("@modules/scan/infrastructure/pdfjs-document-reader");
    const { PrismaScanApproval } = await import("@modules/scan/infrastructure/prisma-scan-approval");
    const { PrismaScanImport } = await import("@modules/scan/infrastructure/prisma-scan-import");
    const { startScan } = await import("@modules/scan/application/start-scan");
    const { runScan } = await import("@modules/scan/application/run-scan");
    const { reviewScan } = await import("@modules/scan/application/review-scan");
    const { approveScan } = await import("@modules/scan/application/approve-scan");
    const { previewImportRemoval } = await import("@modules/scan/application/remove-import");
    const store = new PrismaScanStore();
    const writer = new PrismaScanApproval();
    const newId = () => crypto.randomUUID();

    const { run } = await startScan(
      { store, runner: idle, sources: new PrismaScanSources(), sha256 },
      { publicationId: seeded.publication.id, profileId: "book-v1", recognizeMath: "never" },
    );
    await runScan({ store, storage: seeded.storage, opener: new PdfjsDocumentReader(), sourceKey: storageKeyOfAsset }, run.id);
    const items = await store.listItems(run.id);
    const structure = items.filter((i) => !["CONTENT", "NOTE", "FIGURE"].includes(i.kind));

    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-01T10:00:00Z"));
      await reviewScan({ store, newId }, run.id, { type: "accept", itemIds: structure.map((i) => i.id) });
      await approveScan({ store, writer }, { runId: run.id, destinationId: null, includeSuggested: false });

      vi.setSystemTime(new Date("2026-10-02T10:00:00Z"));
      await reviewScan({ store, newId }, run.id, { type: "accept", itemIds: items.map((i) => i.id) });
      const second = await approveScan({ store, writer }, { runId: run.id, destinationId: null, includeSuggested: false });
      expect(second.summary.bodyAppends).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }

    const preview = await previewImportRemoval({ store, imports: new PrismaScanImport() }, run.id);
    expect(preview.keptRows).toEqual([]);
    expect(preview.trash.length).toBe(preview.created);
  });

  it("o corpo que a importação acrescentou a um nó que já existia sai com ela (#249, CAP-09)", async () => {
    // O capítulo e a seção já estavam no livro, com texto escrito à mão. O scan os reaproveita e
    // acrescenta a teoria ao corpo. Apagar a importação mantém os dois nós — não foi ela que os
    // criou (ADR 0006) —, mas o texto e as âncoras que ela pôs ali saem; senão, a reimportação
    // marcava o conteúdo novo como "já no acervo", e o corpo velho ficava.
    const seeded = await seedBookWithSource("book-a.pdf", "reimport-reused");
    const { prisma, publication } = seeded;
    const { PrismaScanStore, PrismaScanSources, storageKeyOfAsset } = await import("@modules/scan/infrastructure/prisma-scan-store");
    const { PdfjsDocumentReader } = await import("@modules/scan/infrastructure/pdfjs-document-reader");
    const { PrismaScanApproval } = await import("@modules/scan/infrastructure/prisma-scan-approval");
    const { PrismaScanImport } = await import("@modules/scan/infrastructure/prisma-scan-import");
    const { startScan } = await import("@modules/scan/application/start-scan");
    const { runScan } = await import("@modules/scan/application/run-scan");
    const { reviewScan } = await import("@modules/scan/application/review-scan");
    const { approveScan } = await import("@modules/scan/application/approve-scan");
    const { removeImport } = await import("@modules/scan/application/remove-import");
    const { PrismaNodeAnchors } = await import("@modules/assets/infrastructure/prisma-node-anchors");
    const store = new PrismaScanStore();

    const { run } = await startScan(
      { store, runner: idle, sources: new PrismaScanSources(), sha256 },
      { publicationId: publication.id, profileId: "book-v1", recognizeMath: "never" },
    );
    await runScan({ store, storage: seeded.storage, opener: new PdfjsDocumentReader(), sourceKey: storageKeyOfAsset }, run.id);
    const items = await store.listItems(run.id);
    const chapterItem = items.find((i) => i.kind === "CHAPTER")!;
    const sectionItem = items.find((i) => i.kind === "SECTION" && i.parentKey === chapterItem.key)!;

    const chapter = await prisma.documentNode.create({
      data: { publicationId: publication.id, kind: "CHAPTER", title: chapterItem.title, originalLabel: chapterItem.number, sortKey: "a0" },
    });
    const section = await prisma.documentNode.create({
      data: {
        publicationId: publication.id,
        parentId: chapter.id,
        kind: "SECTION",
        title: sectionItem.title,
        originalLabel: sectionItem.number,
        sortKey: "a0",
        bodyLatex: "Texto que eu escrevi.",
      },
    });

    await reviewScan({ store, newId: () => crypto.randomUUID() }, run.id, { type: "acceptSuggested" });
    const approved = await approveScan({ store, writer: new PrismaScanApproval() }, { runId: run.id, destinationId: null, includeSuggested: true });
    expect(approved.summary.reusedNodes).toBeGreaterThanOrEqual(2);
    const filled = await prisma.documentNode.findUniqueOrThrow({ where: { id: section.id }, select: { bodyLatex: true } });
    expect(filled.bodyLatex.length).toBeGreaterThan("Texto que eu escrevi.".length);

    await removeImport({ store, imports: new PrismaScanImport() }, { runId: run.id, scope: "import" });

    const after = await prisma.documentNode.findUniqueOrThrow({ where: { id: section.id }, select: { bodyLatex: true, deletedAt: true } });
    expect(after).toEqual({ bodyLatex: "Texto que eu escrevi.", deletedAt: null });
    expect(await new PrismaNodeAnchors().listForNode(section.id)).toEqual([]);
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

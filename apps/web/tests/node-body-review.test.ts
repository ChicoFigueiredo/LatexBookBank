import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { ScanRunner } from "@modules/scan/application/scan-store";

import { createTempDatabase } from "./support/temp-database";
import { seedBookWithSource } from "./support/scan-seed";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * O corpo que veio do scan também fica *a revisar* (#252, SPG-06 · D40 · ADR 0004).
 *
 * A questão aprovada do scan nasce `DRAFT` com âncora de máquina, e o filtro da árvore a mostra.
 * O exemplo e a teoria da seção entram com o mesmo texto de máquina — e o filtro não mostrava
 * nenhum deles. A regra continua derivada, sem coluna: corpo com texto de máquina que nenhuma
 * pessoa tocou depois.
 */

const sha256 = async (text: string) => createHash("sha256").update(text).digest("hex");
const idle: ScanRunner = { ensure: () => undefined, isRunning: () => false };

let dispose: () => Promise<void>;
beforeAll(async () => {
  dispose = (await createTempDatabase()).dispose;
});
afterAll(async () => {
  await dispose();
});

describe("corpo vindo do scan, a revisar", () => {
  it("o exemplo e a teoria entram a revisar; conferir ou editar à mão os tira do filtro", async () => {
    const seeded = await seedBookWithSource("book-a.pdf", "corpo-a-revisar");
    const { PrismaScanStore, PrismaScanSources, storageKeyOfAsset } =
      await import("@modules/scan/infrastructure/prisma-scan-store");
    const { PdfjsDocumentReader } =
      await import("@modules/scan/infrastructure/pdfjs-document-reader");
    const { PrismaScanApproval } =
      await import("@modules/scan/infrastructure/prisma-scan-approval");
    const { startScan } = await import("@modules/scan/application/start-scan");
    const { runScan } = await import("@modules/scan/application/run-scan");
    const { approveScan } = await import("@modules/scan/application/approve-scan");
    const { getPublicationTree } =
      await import("@modules/document-tree/application/get-publication-tree");
    const { PrismaDocumentTreeRepository } =
      await import("@modules/document-tree/infrastructure/prisma-document-tree-repository");
    const { confirmNodeBody, saveNodeBody } =
      await import("@modules/document-tree/application/save-node-body");
    const { PrismaNodeBodyRepository } =
      await import("@modules/document-tree/infrastructure/prisma-node-body");

    const store = new PrismaScanStore();
    const { run } = await startScan(
      { store, runner: idle, sources: new PrismaScanSources(), sha256 },
      {
        publicationId: seeded.publication.id,
        profileId: "book-v1",
        recognizeMath: "never",
        forceNew: false,
      },
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

    const tree = () =>
      getPublicationTree(new PrismaDocumentTreeRepository(), seeded.publication.id);
    const before = await tree();
    const chapter = before.find((node) => node.kind === "CHAPTER")!;
    const section = before.find((node) => node.originalLabel === "1.1")!;
    const examples = before.filter((node) => node.kind === "EXAMPLE");

    // O capítulo não recebeu texto nenhum: não há o que conferir.
    expect(chapter.toReview).toBe(false);
    expect(section.toReview).toBe(true);
    expect(examples.length).toBeGreaterThan(1);
    expect(examples.every((node) => node.toReview)).toBe(true);

    const bodies = new PrismaNodeBodyRepository();
    await confirmNodeBody(bodies, {
      publicationId: seeded.publication.id,
      nodeId: examples[0]!.id,
    });
    const current = await bodies.find(seeded.publication.id, examples[1]!.id);
    await saveNodeBody(bodies, {
      publicationId: seeded.publication.id,
      nodeId: examples[1]!.id,
      expectedUpdatedAt: current!.updatedAt,
      bodyLatex: `${current!.bodyLatex} Corrigido à mão.`,
    });

    const after = await tree();
    const review = new Map(after.map((node) => [node.id, node.toReview]));
    expect(review.get(examples[0]!.id)).toBe(false);
    expect(review.get(examples[1]!.id)).toBe(false);
    expect(review.get(section.id)).toBe(true);
  });
});

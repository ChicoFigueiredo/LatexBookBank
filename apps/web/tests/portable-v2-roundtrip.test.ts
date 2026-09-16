import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ScanRunner } from "@modules/scan/application/scan-store";

import { createTempDatabase } from "./support/temp-database";
import { seedBookWithSource } from "./support/scan-seed";

/**
 * O `.lbb` v2 contra o banco (ADR 0001, D50): um livro escaneado e aprovado sai com o corpo das
 * seções, as âncoras de cada nó e o PDF fonte — e volta igual numa biblioteca nova.
 */

const idle: ScanRunner = { ensure: () => undefined, isRunning: () => false };
const sha256 = async (text: string) => createHash("sha256").update(text).digest("hex");

describe("exportar e importar um livro escaneado", () => {
  let dispose: () => Promise<void>;
  beforeAll(async () => {
    dispose = (await createTempDatabase()).dispose;
  });
  afterAll(async () => {
    await dispose();
  });

  it("corpo, âncoras em ordem e PDF fonte atravessam o arquivo", async () => {
    const seeded = await seedBookWithSource("book-c.pdf", "lbb-v2");
    const { prisma, storage, workspace, publication } = seeded;
    const { PrismaScanStore, PrismaScanSources, storageKeyOfAsset } = await import("@modules/scan/infrastructure/prisma-scan-store");
    const { PdfjsDocumentReader } = await import("@modules/scan/infrastructure/pdfjs-document-reader");
    const { PrismaScanApproval } = await import("@modules/scan/infrastructure/prisma-scan-approval");
    const { startScan } = await import("@modules/scan/application/start-scan");
    const { runScan } = await import("@modules/scan/application/run-scan");
    const { approveScan } = await import("@modules/scan/application/approve-scan");
    const { readWorkspaceForExport } = await import("@modules/portability/infrastructure/prisma-workspace-source");
    const { writeImportedWorkspace } = await import("@modules/portability/infrastructure/prisma-workspace-sink");
    const { toPortable } = await import("@modules/portability/application/export-workspace");
    const { toRuntime } = await import("@modules/portability/application/import-workspace");
    const { readArchive, writeArchive } = await import("@modules/portability/domain/portable-archive");

    const store = new PrismaScanStore();
    const { run } = await startScan(
      { store, runner: idle, sources: new PrismaScanSources(), sha256 },
      { publicationId: publication.id, profileId: "book-v1", recognizeMath: "never" },
    );
    await runScan({ store, storage, opener: new PdfjsDocumentReader(), sourceKey: storageKeyOfAsset }, run.id);
    await approveScan({ store, writer: new PrismaScanApproval() }, { runId: run.id, destinationId: null, includeSuggested: true });

    const exported = await readWorkspaceForExport(workspace.id, storage);
    expect(exported?.missingAssets).toEqual([]);
    const bytes = await writeArchive({
      workspace: toPortable(exported!.workspace),
      assets: exported!.assets,
      appVersion: "test",
      exportedAt: "2026-09-16T00:00:00Z",
    });

    const read = await readArchive(bytes);
    expect(read.manifest.formatVersion).toBe(2);
    const report = await writeImportedWorkspace(toRuntime(read.workspace), read.assets, storage);
    expect(report.missingAssets).toEqual([]);

    const imported = await prisma.publication.findFirstOrThrow({
      where: { workspaceId: report.workspaceId },
      select: { id: true, sourcePdfAssetId: true },
    });
    expect(imported.sourcePdfAssetId).not.toBeNull();

    const section = await prisma.documentNode.findFirstOrThrow({
      where: { publicationId: imported.id, kind: "SECTION" },
      select: { bodyLatex: true },
    });
    expect(section.bodyLatex).toContain("progressão aritmética");

    const exercise = await prisma.documentNode.findFirstOrThrow({
      where: { publicationId: imported.id, kind: "QUESTION", originalLabel: "2" },
      select: {
        sourceAnchorId: true,
        question: { select: { sourceAnchorId: true, statementLatex: true } },
        anchors: { orderBy: { sortOrder: "asc" }, select: { role: true, sourceAnchor: { select: { pageNumber: true, sourceAssetId: true, extractionMethod: true } } } },
      },
    });
    expect(exercise.anchors.map((a) => [a.sourceAnchor.pageNumber, a.role])).toEqual([
      [2, "PRIMARY"],
      [3, "CONTINUATION"],
    ]);
    expect(exercise.anchors.every((a) => a.sourceAnchor.sourceAssetId === imported.sourcePdfAssetId)).toBe(true);
    expect(exercise.anchors[0]?.sourceAnchor.extractionMethod).toBe("scan:book-v1@1");
    expect(exercise.sourceAnchorId).not.toBeNull();
    expect(exercise.question?.sourceAnchorId).toBe(exercise.sourceAnchorId);
    expect(exercise.question?.statementLatex).toContain("\\item[a)]");
  });
});

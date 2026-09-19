import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { ScanRunner } from "@modules/scan/application/scan-store";

import { createTempDatabase } from "./support/temp-database";
import { seedBookWithSource } from "./support/scan-seed";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const sha256 = async (text: string) => createHash("sha256").update(text).digest("hex");
const idle: ScanRunner = { ensure: () => undefined, isRunning: () => false };

/**
 * As figuras, de ponta a ponta (Fase 24 · D58 · ADR 0005): o desenho do livro vira arquivo no
 * acervo durante a varredura, e a aprovação o põe no corpo da seção, na posição, com legenda.
 */
describe("figuras no acervo", () => {
  let dispose: () => Promise<void>;
  beforeAll(async () => {
    dispose = (await createTempDatabase()).dispose;
  });
  afterAll(async () => {
    await dispose();
  });

  it("a varredura grava o arquivo, e a aprovação escreve o \\includegraphics", async () => {
    const seeded = await seedBookWithSource("book-a.pdf", "figuras-a");
    const { PrismaScanStore, PrismaScanSources, storageKeyOfAsset } = await import("@modules/scan/infrastructure/prisma-scan-store");
    const { PdfjsDocumentReader } = await import("@modules/scan/infrastructure/pdfjs-document-reader");
    const { PrismaScanApproval } = await import("@modules/scan/infrastructure/prisma-scan-approval");
    const { PrismaFigureAssets } = await import("@modules/scan/infrastructure/prisma-figure-assets");
    const { PdfFigureCropper } = await import("@modules/scan/infrastructure/pdf-figure-cropper");
    const { createFigurePass } = await import("@modules/scan/application/figure-pass");
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
      {
        store,
        storage: seeded.storage,
        opener: new PdfjsDocumentReader(),
        sourceKey: storageKeyOfAsset,
        figures: createFigurePass({
          assets: new PrismaFigureAssets(seeded.storage),
          cropper: ({ bytes, pdf }) =>
            new PdfFigureCropper({ bytes, render: (page, box, dpi) => pdf.renderRegion(page, box, dpi) }),
        }),
      },
      run.id,
    );

    // O arquivo existe, é PDF (vetorial), e o item sabe o nome que o LaTeX vai citar.
    const figura = (await store.listItems(run.id)).find((item) => item.kind === "FIGURE");
    expect(figura).toBeDefined();
    const assetId = String(figura!.metadata["figureAsset"]);
    const latexName = String(figura!.metadata["figureLatexName"]);
    expect(latexName.endsWith(".pdf")).toBe(true);

    const asset = await seeded.prisma.asset.findUniqueOrThrow({ where: { id: assetId } });
    expect(asset.mimeType).toBe("application/pdf");
    expect(asset.kind).toBe("CROP");
    const gravado = await seeded.storage.get(asset.storageKey as never);
    expect(Buffer.from(gravado.content).toString("latin1").startsWith("%PDF-")).toBe(true);

    // E o PNG de tela, que é o que a revisão mostra.
    expect(String(figura!.metadata["figureScreenAsset"])).not.toBe(assetId);

    await reviewScan({ store, newId: () => crypto.randomUUID() }, run.id, { type: "acceptSuggested" });
    await approveScan(
      { store, writer: new PrismaScanApproval() },
      { runId: run.id, destinationId: null, includeSuggested: false },
    );

    const secao = await seeded.prisma.documentNode.findFirstOrThrow({
      where: { publicationId: seeded.publication.id, originalLabel: "1.1", kind: "SECTION" },
      select: { bodyLatex: true },
    });
    expect(secao.bodyLatex).toContain("\\begin{figure}[H]");
    expect(secao.bodyLatex).toContain(`\\includegraphics[width=`);
    expect(secao.bodyLatex).toContain(latexName);
    expect(secao.bodyLatex).toContain("\\caption{O gráfico de uma função linear.}");
    // Na posição: a figura vem depois da teoria que a antecede no livro.
    expect(secao.bodyLatex.indexOf("Uma função")).toBeLessThan(secao.bodyLatex.indexOf("\\begin{figure}"));
  });
});

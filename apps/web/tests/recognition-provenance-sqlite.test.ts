import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * A proveniência só é gravada na âncora do livro da URL e do recorte aprovado (SEC-06).
 *
 * `anchorId` e `cropAssetId` vêm do corpo de `POST /api/publications/[id]/questions/from-recognition`.
 * Sem a conferência, a questão nascia neste livro com a origem apontando para a âncora de outro, e
 * a âncora alheia recebia o texto do modelo.
 */

let dispose: () => Promise<void>;
beforeAll(async () => {
  dispose = (await createTempDatabase()).dispose;
});
afterAll(async () => {
  await dispose();
});

const run = {
  providerId: "vision",
  model: "modelo",
  durationMs: 10,
  confidence: 0.9,
  mode: "display",
  rawLatex: "x^2",
  recognizedAt: "2026-10-28T12:00:00.000Z",
};

async function livroComRecorte(slug: string) {
  const { prisma } = await import("@infrastructure/database/sqlite/client");
  const workspace = await prisma.workspace.create({ data: { name: slug, slug } });
  const publication = await prisma.publication.create({
    data: { workspaceId: workspace.id, title: slug },
  });
  const asset = (kind: string, name: string) =>
    prisma.asset.create({
      data: {
        workspaceId: workspace.id,
        publicationId: publication.id,
        kind,
        storageKey: `${slug}-${name}`,
        mimeType: kind === "CROP" ? "image/png" : "application/pdf",
        originalFilename: name,
        sha256: `${slug}-${name}`,
        sizeBytes: 1,
      },
      select: { id: true },
    });
  const source = await asset("SOURCE_PDF", "livro.pdf");
  const crop = await asset("CROP", "recorte.png");
  const anchor = await prisma.sourceAnchor.create({
    data: {
      publicationId: publication.id,
      sourceAssetId: source.id,
      cropAssetId: crop.id,
      pageNumber: 1,
      xNormalized: 0.1,
      yNormalized: 0.1,
      widthNormalized: 0.5,
      heightNormalized: 0.1,
    },
    select: { id: true },
  });
  const sourceText = async () =>
    (
      await prisma.sourceAnchor.findUniqueOrThrow({
        where: { id: anchor.id },
        select: { sourceText: true },
      })
    ).sourceText;
  return { publicationId: publication.id, anchorId: anchor.id, cropAssetId: crop.id, sourceText };
}

describe("a proveniência do reconhecimento", () => {
  it("grava na âncora do livro e do recorte", async () => {
    const { PrismaRecognitionProvenance } =
      await import("@modules/recognition/infrastructure/prisma-recognition-provenance");
    const livro = await livroComRecorte("proveniencia-ok");

    expect(await new PrismaRecognitionProvenance().recordRun(livro, run)).toBe(true);
    expect(await livro.sourceText()).toBe("x^2");
  });

  it("a âncora de outro livro não é achada", async () => {
    const { PrismaRecognitionProvenance } =
      await import("@modules/recognition/infrastructure/prisma-recognition-provenance");
    const deste = await livroComRecorte("proveniencia-deste");
    const doOutro = await livroComRecorte("proveniencia-outro");

    const gravou = await new PrismaRecognitionProvenance().recordRun(
      { ...doOutro, publicationId: deste.publicationId },
      run,
    );

    expect(gravou).toBe(false);
    expect(await doOutro.sourceText()).toBeNull();
  });

  it("a âncora de outro recorte não é achada", async () => {
    const { PrismaRecognitionProvenance } =
      await import("@modules/recognition/infrastructure/prisma-recognition-provenance");
    const livro = await livroComRecorte("proveniencia-recorte");
    const outro = await livroComRecorte("proveniencia-recorte-outro");

    const gravou = await new PrismaRecognitionProvenance().recordRun(
      { ...livro, cropAssetId: outro.cropAssetId },
      run,
    );

    expect(gravou).toBe(false);
    expect(await livro.sourceText()).toBeNull();
  });
});

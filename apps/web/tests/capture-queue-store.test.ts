import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pendingQueue } from "@modules/recognition/domain/capture-queue";

import { createTempDatabase } from "./support/temp-database";

/**
 * A fila de captura lida do banco (#253): o que o rail e a tela de Ingestão mostram.
 *
 * O domínio da fila (`capture-queue.test.ts`) decide o estado a partir dos fatos; aqui o que se
 * prova é que os fatos certos chegam — que as âncoras do scan aprovado não empurram os recortes
 * pendentes para fora, e que uma falha de reconhecimento não apaga a transcrição.
 */

let dispose: () => Promise<void>;
beforeAll(async () => {
  dispose = (await createTempDatabase()).dispose;
});
afterAll(async () => {
  await dispose();
});

async function seedPublication(slug: string) {
  const { prisma } = await import("@infrastructure/database/sqlite/client");
  const workspace = await prisma.workspace.create({ data: { name: slug, slug } });
  const publication = await prisma.publication.create({
    data: { workspaceId: workspace.id, title: slug },
  });
  const source = await prisma.asset.create({
    data: {
      workspaceId: workspace.id,
      publicationId: publication.id,
      kind: "SOURCE_PDF",
      storageKey: `${slug}.pdf`,
      mimeType: "application/pdf",
      originalFilename: `${slug}.pdf`,
      sha256: slug,
      sizeBytes: 1,
    },
  });
  const crop = (name: string) =>
    prisma.asset.create({
      data: {
        workspaceId: workspace.id,
        publicationId: publication.id,
        kind: "CROP",
        storageKey: `${slug}-${name}.png`,
        mimeType: "image/png",
        originalFilename: `${name}.png`,
        sha256: `${slug}-${name}`,
        sizeBytes: 1,
      },
      select: { id: true },
    });
  const anchor = (
    createdAt: Date,
    extra: { sourceText?: string; extractionMethod?: string; cropAssetId?: string } = {},
  ) =>
    prisma.sourceAnchor.create({
      data: {
        publicationId: publication.id,
        sourceAssetId: source.id,
        pageNumber: 1,
        xNormalized: 0.1,
        yNormalized: 0.1,
        widthNormalized: 0.5,
        heightNormalized: 0.1,
        createdAt,
        ...extra,
      },
      select: { id: true },
    });
  return { prisma, publication, anchor, crop };
}

describe("a fila de captura lida do banco", () => {
  it("as âncoras de um scan aprovado não empurram os recortes pendentes para fora (CAP-08)", async () => {
    const { readCaptureFacts } =
      await import("@modules/recognition/infrastructure/prisma-capture-queue");
    const { prisma, publication, anchor } = await seedPublication("fila-depois-do-scan");

    // Dez recortes da Ingestão, ainda na fila.
    const recortes: string[] = [];
    for (let i = 0; i < 10; i++)
      recortes.push((await anchor(new Date(Date.UTC(2026, 0, 1, 0, i)))).id);

    // Depois, um scan do mesmo livro aprovado: 250 âncoras mais novas, cada uma ligada a um nó —
    // a principal pela coluna antiga, a de continuação só pela lista de âncoras do nó.
    for (let i = 0; i < 125; i++) {
      const createdAt = new Date(Date.UTC(2026, 1, 1, 0, i));
      const principal = await anchor(createdAt, {
        sourceText: "texto do scan",
        extractionMethod: "scan:book-v1@1",
      });
      const continuacao = await anchor(createdAt, {
        sourceText: "texto do scan",
        extractionMethod: "scan:book-v1@1",
      });
      await prisma.documentNode.create({
        data: {
          publicationId: publication.id,
          kind: "SECTION",
          sortKey: `a${i}`,
          sourceAnchorId: principal.id,
          anchors: {
            create: [
              { sourceAnchorId: principal.id, sortOrder: 0, role: "PRIMARY" },
              { sourceAnchorId: continuacao.id, sortOrder: 1, role: "CONTINUATION" },
            ],
          },
        },
      });
    }

    const fila = pendingQueue(await readCaptureFacts(publication.id));
    expect(fila.map((item) => item.anchorId).sort()).toEqual([...recortes].sort());
  });

  it("a falha de um novo reconhecimento não apaga a transcrição anterior (CAP-15)", async () => {
    const { readCaptureFacts, recordRecognition, recordRecognitionFailure } =
      await import("@modules/recognition/infrastructure/prisma-capture-queue");
    const { publication, anchor, crop } = await seedPublication("fila-falha");
    const imagem = await crop("recorte");
    const recorte = await anchor(new Date(Date.UTC(2026, 0, 1)), { cropAssetId: imagem.id });
    const alvo = { anchorId: recorte.id, cropAssetId: imagem.id };

    await recordRecognition(alvo, {
      latex: "x^2 + 1",
      method: "recognition:vision",
      model: "modelo",
      metadataJson: "{}",
    });
    await recordRecognitionFailure(alvo, {
      error: "tempo esgotado",
      at: new Date(Date.UTC(2026, 0, 2)),
    });

    const [item] = pendingQueue(await readCaptureFacts(publication.id));
    expect(item).toMatchObject({ state: "error", recognizedText: "x^2 + 1" });
  });

  it("o reconhecimento só grava na âncora do recorte que foi lido (SEC-06)", async () => {
    // `anchorId` e `cropAssetId` vêm do formulário: uma âncora de outro recorte não recebe a
    // transcrição — nem a falha — de uma imagem que não é a dela.
    const { recordRecognition, recordRecognitionFailure } =
      await import("@modules/recognition/infrastructure/prisma-capture-queue");
    const { prisma, anchor, crop } = await seedPublication("fila-escopo");
    const deste = await crop("deste");
    const doOutro = await crop("do-outro");
    const recorte = await anchor(new Date(Date.UTC(2026, 0, 1)), { cropAssetId: deste.id });
    const alheio = { anchorId: recorte.id, cropAssetId: doOutro.id };

    expect(
      await recordRecognition(alheio, {
        latex: "y",
        method: "recognition:vision",
        model: "modelo",
        metadataJson: "{}",
      }),
    ).toBe(false);
    expect(
      await recordRecognitionFailure(alheio, { error: "x", at: new Date(Date.UTC(2026, 0, 2)) }),
    ).toBe(false);
    expect(
      await prisma.sourceAnchor.findUniqueOrThrow({
        where: { id: recorte.id },
        select: { sourceText: true, extractionMethod: true },
      }),
    ).toEqual({ sourceText: null, extractionMethod: null });
  });
});

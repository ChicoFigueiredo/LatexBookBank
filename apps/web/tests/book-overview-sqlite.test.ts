import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
// Só o tipo: o valor vem por `import()` depois do banco, porque o cliente Prisma lê
// `DATABASE_URL` ao ser importado.
import type { readBookOverview as ReadBookOverview } from "@modules/publications/infrastructure/prisma-book-overview";

import { createTempDatabase } from "./support/temp-database";

// Milhares de linhas num SQLite com as migrações: passa folgado dos 5 s padrão.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

/**
 * O resumo do livro contra um SQLite real, no tamanho de um livro de verdade.
 *
 * A tela abria em 500 num livro com muitos recortes: a leitura das âncoras trazia, de cada uma, a
 * primeira questão ligada, e o Prisma monta essa relação com um `IN` de todos os ids — mais
 * parâmetros do que o banco aceita numa consulta. Contra o dublê, ou com três âncoras, nunca
 * aparece.
 */

/** O tamanho do Fundamentos 1 quando a tela quebrou: 9 608 recortes. */
const ANCORAS = 10_000;

let dispose: () => Promise<void>;
let prisma: PrismaClient;
let readBookOverview: typeof ReadBookOverview;

beforeAll(async () => {
  const db = await createTempDatabase();
  dispose = db.dispose;

  ({ prisma } = await import("@infrastructure/database/sqlite/client"));
  ({ readBookOverview } =
    await import("@modules/publications/infrastructure/prisma-book-overview"));
});

afterAll(async () => {
  await dispose();
});

describe("o resumo do livro num livro grande", () => {
  it("abre, e conta os recortes capturados e os da fila", async () => {
    const workspace = await prisma.workspace.create({ data: { name: "Acervo", slug: "acervo" } });
    const publication = await prisma.publication.create({
      data: { workspaceId: workspace.id, title: "Livro grande" },
    });
    const pdf = await prisma.asset.create({
      data: {
        workspaceId: workspace.id,
        publicationId: publication.id,
        kind: "SOURCE_PDF",
        storageKey: "grande/fonte.pdf",
        mimeType: "application/pdf",
        sha256: "0".repeat(64),
        sizeBytes: 1,
      },
    });
    await prisma.sourceAnchor.createMany({
      data: Array.from({ length: ANCORAS }, (_, i) => ({
        publicationId: publication.id,
        sourceAssetId: pdf.id,
        pageNumber: 1 + (i % 400),
        xNormalized: 0,
        yNormalized: 0,
        widthNormalized: 1,
        heightNormalized: 1,
      })),
    });
    // Duas capturadas: uma questão na âncora de uma página qualquer e outra na da última.
    const [primeira, ultima] = await Promise.all([
      prisma.sourceAnchor.findFirstOrThrow({ where: { pageNumber: 7 } }),
      prisma.sourceAnchor.findFirstOrThrow({ where: { pageNumber: 400 } }),
    ]);
    for (const ancora of [primeira, ultima]) {
      await prisma.question.create({
        data: { type: "MULTIPLE_CHOICE", sourceAnchorId: ancora.id },
      });
    }

    const overview = await readBookOverview(publication.id);

    expect(overview?.capture).toMatchObject({ captured: 2, queued: ANCORAS - 2, lastPage: 400 });
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { pngFile, useTempStorage } from "./support/asset-routes";
import { installRouteFetch, type RouteEntry } from "./support/route-fetch";
import { fixtureBytes } from "./support/scan-fixtures";
import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * O cliente da captura contra as rotas de verdade (tarefa I8 · STM-17 e ARQ-10 da revisão de
 * 2026-09-23).
 *
 * O `IngestionPanel` montava três `FormData` à mão e lia as respostas com a forma escrita no
 * próprio arquivo. Aqui o `captureApi` sobe o PDF, salva o recorte e pede o reconhecimento como o
 * painel faz, contra os Route Handlers, um SQLite e um storage temporários. O reconhecedor fica
 * sem configurar: a recusa dele também é contrato, e é a que a tela mostra.
 */

const ROUTES: readonly RouteEntry[] = [
  ["POST", "/api/assets", () => import("../app/api/assets/route")],
  ["POST", "/api/assets/crop", () => import("../app/api/assets/crop/route")],
  ["POST", "/api/recognition", () => import("../app/api/recognition/route")],
];

let dispose: () => Promise<void>;
let restore: () => void = () => {};
const visionEnv = { base: process.env["AI_BASE_URL"], model: process.env["AI_VISION_MODEL"] };

beforeAll(async () => {
  dispose = (await createTempDatabase()).dispose;
  delete process.env["AI_BASE_URL"];
  delete process.env["AI_VISION_MODEL"];
  await useTempStorage();
});

afterAll(async () => {
  if (visionEnv.base !== undefined) process.env["AI_BASE_URL"] = visionEnv.base;
  if (visionEnv.model !== undefined) process.env["AI_VISION_MODEL"] = visionEnv.model;
  (await import("@/shared/config/env")).resetEnvCache();
  await dispose();
});

afterEach(() => restore());

describe("o cliente da captura fala a língua das rotas", () => {
  it("sobe o PDF que vira fonte do livro, salva o recorte com âncora, e lê a recusa do modelo", async () => {
    const { prisma } = await import("@infrastructure/database/sqlite/client");
    const workspace = await prisma.workspace.create({ data: { name: "captura", slug: "captura" } });
    const publication = await prisma.publication.create({
      data: { workspaceId: workspace.id, title: "Livro" },
    });
    restore = installRouteFetch(ROUTES).restore;
    const { captureApi } = await import("@modules/recognition/ui/capture-client");

    const pdf = new File([new Uint8Array(fixtureBytes("book-a.pdf"))], "book-a.pdf", {
      type: "application/pdf",
    });
    const subido = await captureApi.upload({
      file: pdf,
      workspaceId: workspace.id,
      publicationId: publication.id,
    });

    expect(subido.ok).toBe(true);
    expect(subido.body.id).toEqual(expect.any(String));
    expect(subido.body.becameBookSource).toBe(true);
    expect(subido.body.kind).toBe("SOURCE_PDF");
    expect(subido.body).not.toHaveProperty("storageKey");

    const recorte = await captureApi.saveCrop({
      png: pngFile("recorte.png", "png de mentira"),
      sourceAssetId: subido.body.id!,
      publicationId: publication.id,
      pageNumber: 1,
      box: { x: 0.1, y: 0.2, width: 0.6, height: 0.3 },
      questionId: null,
    });

    expect(recorte.ok).toBe(true);
    expect(recorte.body.anchorId).toEqual(expect.any(String));
    expect(recorte.body.cropAssetId).toEqual(expect.any(String));
    expect(recorte.body.sourceAssetId).toBe(subido.body.id);

    const lido = await captureApi.recognize({
      png: pngFile("recorte.png", "png de mentira"),
      cropAssetId: recorte.body.cropAssetId!,
      mode: "mixed",
      anchorId: recorte.body.anchorId ?? null,
    });

    expect(lido.ok).toBe(false);
    expect(lido.status).toBe(503);
    expect(lido.body.message).toMatch(/AI_VISION_MODEL/);

    expect(
      await captureApi.recognizeInBatch({
        png: pngFile("recorte.png", "png de mentira"),
        cropAssetId: recorte.body.cropAssetId!,
        mode: "mixed",
      }),
    ).toBe(false);
  });

  it("a recusa do upload chega com a mensagem da rota", async () => {
    restore = installRouteFetch(ROUTES).restore;
    const { captureApi } = await import("@modules/recognition/ui/capture-client");

    const recusado = await captureApi.upload({
      file: new File([new Uint8Array([1, 2, 3])], "x.exe", { type: "application/x-msdownload" }),
      workspaceId: "ws-que-nao-existe",
      publicationId: "pub-que-nao-existe",
    });

    expect(recusado.ok).toBe(false);
    expect(recusado.body.id).toBeUndefined();
    expect(recusado.body.message).toEqual(expect.any(String));
  });
});

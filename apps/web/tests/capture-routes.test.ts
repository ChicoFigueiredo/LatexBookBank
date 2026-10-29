import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { resetEnvCache } from "@/shared/config/env";

import { multipart, pngFile, seedQuestion, useTempStorage } from "./support/asset-routes";
import { seedBookWithSource } from "./support/scan-seed";
import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * A captura pelas rotas: recortar, reconhecer e descartar.
 *
 * As três orquestravam o adaptador direto da rota — o recorte encadeava storage, asset, âncora e
 * questão sem transação; o reconhecimento decidia na rota o que gravar na âncora; o descarte
 * decidia no adaptador o que é "em uso" (STE-03, STM-04). Este arquivo é a rede para levar essas
 * decisões aos casos de uso: o que cada rota responde não muda.
 */

let dispose: () => Promise<void>;
let endpoint: Server;
let endpointUrl: string;
/** O que o endpoint de visão falso responde. `null` faz ele recusar com 500. */
let resposta: string | null = "\\frac{1}{2}";

beforeAll(async () => {
  dispose = (await createTempDatabase()).dispose;
  await useTempStorage();

  // Um endpoint OpenAI-compatible de mentira, em loopback: o reconhecimento sai pela rede de
  // verdade, sem depender de modelo nenhum.
  endpoint = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      if (resposta === null) {
        response.writeHead(500).end("modelo caiu");
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content: resposta } }] }));
    });
  });
  await new Promise<void>((resolve) => endpoint.listen(0, "127.0.0.1", resolve));
  endpointUrl = `http://127.0.0.1:${(endpoint.address() as AddressInfo).port}/v1`;
});

afterAll(async () => {
  await new Promise((resolve) => endpoint.close(resolve));
  await dispose();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
  resposta = "\\frac{1}{2}";
});

const caixa = { pageNumber: "1", x: "0.1", y: "0.1", width: "0.5", height: "0.2" };

async function recortar(fields: Record<string, string | File>) {
  const { POST } = await import("../app/api/assets/crop/route");
  return POST(
    multipart("/api/assets/crop", { image: pngFile("recorte.png", "um recorte"), ...fields }),
  );
}

async function anchorOf(anchorId: string) {
  const { prisma } = await import("@infrastructure/database/sqlite/client");
  return prisma.sourceAnchor.findUnique({
    where: { id: anchorId },
    select: {
      sourceText: true,
      extractionMethod: true,
      extractionModel: true,
      metadataJson: true,
      questions: { select: { id: true } },
    },
  });
}

describe("recortar", () => {
  it("salva o recorte, e com questão a âncora fica pendurada nela", async () => {
    const { publication, asset } = await seedBookWithSource("book-a.pdf", "recorte-questao");
    const question = await seedQuestion(publication.id);

    const response = await recortar({
      ...caixa,
      sourceAssetId: asset.id,
      publicationId: publication.id,
      questionId: question.id,
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      anchorId: string;
      cropAssetId: string;
      sourceAssetId: string;
    };
    expect(body.sourceAssetId).toBe(asset.id);
    expect((await anchorOf(body.anchorId))?.questions).toEqual([{ id: question.id }]);
  });

  it("fonte que não existe é 404 source_not_found", async () => {
    const { publication } = await seedBookWithSource("book-a.pdf", "recorte-sem-fonte");

    const response = await recortar({
      ...caixa,
      sourceAssetId: "nao-existe",
      publicationId: publication.id,
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "source_not_found" });
  });

  it("livro de outra biblioteca é 404 owner_not_found", async () => {
    const { asset } = await seedBookWithSource("book-a.pdf", "recorte-dono-a");
    const { publication: alheio } = await seedBookWithSource("book-a.pdf", "recorte-dono-b");

    const response = await recortar({
      ...caixa,
      sourceAssetId: asset.id,
      publicationId: alheio.id,
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "owner_not_found" });
  });

  it("caixa fora da página é 400 invalid_anchor, e nada é gravado", async () => {
    const { publication, asset } = await seedBookWithSource("book-a.pdf", "recorte-fora");
    const { prisma } = await import("@infrastructure/database/sqlite/client");
    const antes = await prisma.asset.count();

    const response = await recortar({
      ...caixa,
      width: "2",
      sourceAssetId: asset.id,
      publicationId: publication.id,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_anchor" });
    expect(await prisma.asset.count()).toBe(antes);
  });
});

describe("descartar da fila", () => {
  const descartar = async (anchorId: string) => {
    const { DELETE } = await import("../app/api/publications/[id]/capture-queue/[anchorId]/route");
    return DELETE(new Request("http://127.0.0.1:28080/", { method: "DELETE" }), {
      params: Promise.resolve({ id: "qualquer", anchorId }),
    });
  };

  it("descarta o recorte solto, e o segundo pedido é 404", async () => {
    const { publication, asset } = await seedBookWithSource("book-a.pdf", "descarte-solto");
    const { anchorId } = (await (
      await recortar({ ...caixa, sourceAssetId: asset.id, publicationId: publication.id })
    ).json()) as { anchorId: string };

    const primeiro = await descartar(anchorId);
    expect(primeiro.status).toBe(200);
    expect(await primeiro.json()).toEqual({ discarded: anchorId });

    const segundo = await descartar(anchorId);
    expect(segundo.status).toBe(404);
    expect(await segundo.json()).toMatchObject({
      error: "not_found",
      message: "Este recorte não está mais na fila.",
    });
  });

  it("recorte que já virou questão é 409 capture_in_use, e fica", async () => {
    const { publication, asset } = await seedBookWithSource("book-a.pdf", "descarte-em-uso");
    const question = await seedQuestion(publication.id);
    const { anchorId } = (await (
      await recortar({
        ...caixa,
        sourceAssetId: asset.id,
        publicationId: publication.id,
        questionId: question.id,
      })
    ).json()) as { anchorId: string };

    const response = await descartar(anchorId);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "capture_in_use" });
    expect(await anchorOf(anchorId)).not.toBeNull();
  });
});

describe("reconhecer a matemática", () => {
  async function reconhecer(fields: Record<string, string>) {
    const { POST } = await import("../app/api/recognition/route");
    return POST(
      multipart("/api/recognition", {
        image: pngFile("r.png", "pixels"),
        mode: "display",
        ...fields,
      }),
    );
  }

  const comVisao = () => {
    vi.stubEnv("AI_BASE_URL", endpointUrl);
    vi.stubEnv("AI_VISION_MODEL", "modelo-visao");
    resetEnvCache();
  };

  it("sem modelo de visão é 503 vision_not_configured", async () => {
    vi.stubEnv("AI_BASE_URL", endpointUrl);
    vi.stubEnv("AI_VISION_MODEL", undefined);
    resetEnvCache();

    const response = await reconhecer({ cropAssetId: "c1" });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "vision_not_configured" });
  });

  it("devolve o candidato e grava a transcrição na âncora", async () => {
    comVisao();
    const { publication, asset } = await seedBookWithSource("book-a.pdf", "reconhecer-ok");
    const { anchorId, cropAssetId } = (await (
      await recortar({ ...caixa, sourceAssetId: asset.id, publicationId: publication.id })
    ).json()) as { anchorId: string; cropAssetId: string };

    const response = await reconhecer({ cropAssetId, anchorId });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      cropAssetId,
      state: "candidate",
      result: { latex: "\\frac{1}{2}", model: "modelo-visao" },
    });
    expect(await anchorOf(anchorId)).toMatchObject({
      sourceText: "\\frac{1}{2}",
      extractionModel: "modelo-visao",
    });
  });

  it("falha do endpoint é 502, a falha fica na âncora e a transcrição anterior também", async () => {
    comVisao();
    const { publication, asset } = await seedBookWithSource("book-a.pdf", "reconhecer-falha");
    const { anchorId, cropAssetId } = (await (
      await recortar({ ...caixa, sourceAssetId: asset.id, publicationId: publication.id })
    ).json()) as { anchorId: string; cropAssetId: string };
    expect((await reconhecer({ cropAssetId, anchorId })).status).toBe(200);

    resposta = null;
    const response = await reconhecer({ cropAssetId, anchorId });

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: "recognition_failed" });
    const anchor = await anchorOf(anchorId);
    expect(anchor?.sourceText).toBe("\\frac{1}{2}");
    expect(anchor?.metadataJson).toContain("HTTP 500");
  });
});

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { fixtureBytes } from "./support/scan-fixtures";
import { multipart, pngFile, seedQuestion, useTempStorage } from "./support/asset-routes";
import { seedBookWithSource } from "./support/scan-seed";
import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * Upload e recorte resolvem a biblioteca no servidor (#256, SEC-06 e ACV-12 da revisão).
 *
 * `workspaceId`, `publicationId` e `questionId` vinham do formulário e iam soltos para o banco: um
 * PDF guardado sob a biblioteca A virava a fonte de um livro da B, e excluir A deixava B sem
 * fonte. A recusa vem **antes** de gravar bytes — um id inventado também deixava arquivo órfão.
 */
describe("o dono do arquivo é resolvido no servidor", () => {
  let dispose: () => Promise<void>;
  let storageRoot = "";
  beforeAll(async () => {
    dispose = (await createTempDatabase()).dispose;
    storageRoot = await useTempStorage();
  });
  afterAll(async () => {
    await dispose();
  });

  const arquivosDe = (workspaceId: string): string[] => {
    const dir = path.join(storageRoot, workspaceId);
    return existsSync(dir) ? readdirSync(dir, { recursive: true, encoding: "utf8" }) : [];
  };

  async function upload(fields: Record<string, string | File>) {
    const { POST } = await import("../app/api/assets/route");
    return POST(multipart("/api/assets", fields));
  }

  async function fonteDe(publicationId: string): Promise<string | null> {
    const { PrismaPublicationRepository } =
      await import("@modules/publications/infrastructure/prisma-publication-repository");
    const detail = await new PrismaPublicationRepository().findDetailById(publicationId);
    return detail?.sourcePdfAssetId ?? null;
  }

  const pdf = () =>
    new File([new Uint8Array(fixtureBytes("book-b.pdf"))], "book-b.pdf", {
      type: "application/pdf",
    });

  async function duasBibliotecas(slug: string) {
    const a = await seedBookWithSource("book-a.pdf", `${slug}-a`);
    const { prisma } = a;
    const b = await prisma.workspace.create({ data: { name: `${slug}-b`, slug: `${slug}-b` } });
    const livroDeB = await prisma.publication.create({
      data: { workspaceId: b.id, title: "O livro da outra biblioteca" },
    });
    return { a, b, livroDeB };
  }

  it("o PDF não vira fonte de um livro de outra biblioteca", async () => {
    const { a, livroDeB } = await duasBibliotecas("fonte-alheia");
    const antes = arquivosDe(a.workspace.id);

    const response = await upload({
      file: pdf(),
      workspaceId: a.workspace.id,
      publicationId: livroDeB.id,
    });

    expect(response.status).toBe(404);
    expect(await fonteDe(livroDeB.id)).toBeNull();
    expect(arquivosDe(a.workspace.id)).toEqual(antes);
  });

  it("uma biblioteca que não existe não ganha diretório no storage", async () => {
    const response = await upload({ file: pdf(), workspaceId: "biblioteca-inventada" });

    expect(response.status).toBe(404);
    expect(existsSync(path.join(storageRoot, "biblioteca-inventada"))).toBe(false);
  });

  it("a figura não se liga a uma questão de outro livro", async () => {
    const { a, b, livroDeB } = await duasBibliotecas("questao-alheia");
    const deB = await seedQuestion(livroDeB.id);

    const response = await upload({
      file: pngFile("grafico.png", "figura de outra questão"),
      workspaceId: a.workspace.id,
      publicationId: a.publication.id,
      questionId: deB.id,
    });

    expect(response.status).toBe(404);
    expect(arquivosDe(b.id)).toEqual([]);
  });

  it("o livro basta: a biblioteca sai dele quando o formulário não a traz", async () => {
    const { workspace } = await seedBookWithSource("book-c.pdf", "so-o-livro");
    const semFonte = await (
      await import("@infrastructure/database/sqlite/client")
    ).prisma.publication.create({ data: { workspaceId: workspace.id, title: "Sem fonte" } });

    const antes = arquivosDe(workspace.id).length;

    const response = await upload({ file: pdf(), publicationId: semFonte.id });

    expect(response.status).toBe(201);
    const { id } = (await response.json()) as { id: string };
    expect(await fonteDe(semFonte.id)).toBe(id);
    expect(arquivosDe(workspace.id).length).toBeGreaterThan(antes);
  });

  async function recortar(fields: Record<string, string>) {
    const { POST } = await import("../app/api/assets/crop/route");
    return POST(
      multipart("/api/assets/crop", {
        image: pngFile("recorte.png", `recorte ${JSON.stringify(fields)}`),
        pageNumber: "1",
        x: "0.1",
        y: "0.1",
        width: "0.5",
        height: "0.2",
        ...fields,
      }),
    );
  }

  it("o recorte de um PDF de A não vira âncora de um livro de B", async () => {
    const { a, livroDeB } = await duasBibliotecas("recorte-alheio");
    const { readCaptureFacts } =
      await import("@modules/recognition/infrastructure/prisma-capture-queue");

    const response = await recortar({ sourceAssetId: a.asset.id, publicationId: livroDeB.id });

    expect(response.status).toBe(404);
    expect(await readCaptureFacts(livroDeB.id)).toEqual([]);
  });

  it("o recorte não muda a origem de uma questão de outro livro", async () => {
    const { a, livroDeB } = await duasBibliotecas("origem-alheia");
    const deB = await seedQuestion(livroDeB.id);
    const { PrismaProvenanceReader } =
      await import("@modules/assets/infrastructure/prisma-provenance-reader");
    const { readCaptureFacts } =
      await import("@modules/recognition/infrastructure/prisma-capture-queue");

    const response = await recortar({
      sourceAssetId: a.asset.id,
      publicationId: a.publication.id,
      questionId: deB.id,
    });

    expect(response.status).toBe(404);
    expect(await new PrismaProvenanceReader().findByQuestionId(deB.id)).toBeNull();
    expect(await readCaptureFacts(a.publication.id)).toEqual([]);
  });
});

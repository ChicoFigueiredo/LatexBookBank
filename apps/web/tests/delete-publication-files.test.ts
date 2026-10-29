import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { asStorageKey } from "@/shared/ports";

import { fixtureBytes } from "./support/scan-fixtures";
import { seedBookWithSource } from "./support/scan-seed";
import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * Excluir um livro, contra o banco e o storage de verdade (#243, ACV-01/PLT-01 da revisão).
 *
 * O storage guarda cada arquivo pelo hash, dentro da biblioteca: o mesmo PDF em dois livros é
 * **um** arquivo, e o `createAsset` devolve a mesma linha para os dois. A exclusão apagava do disco
 * toda chave que o livro citava — inclusive a que o outro livro ainda usa. O teste com dublês não
 * via isso, porque o dublê do storage não deduplica.
 */

describe("excluir um livro, com arquivos compartilhados", () => {
  let dispose: () => Promise<void>;
  beforeAll(async () => {
    dispose = (await createTempDatabase()).dispose;
  });
  afterAll(async () => {
    await dispose();
  });

  it("o PDF que outro livro da biblioteca também usa continua no storage", async () => {
    const { deletePublication } =
      await import("@modules/publications/application/manage-publications");
    const { PrismaPublicationRepository } =
      await import("@modules/publications/infrastructure/prisma-publication-repository");
    const { createAsset } = await import("@modules/assets/infrastructure/prisma-asset-writer");

    const {
      prisma,
      storage,
      workspace,
      publication: ensaio,
    } = await seedBookWithSource("book-a.pdf", "compartilhado");

    // O livro de verdade recebe o mesmo PDF pelo caminho de sempre: o storage deduplica pelo hash,
    // e o `createAsset` devolve a linha que já existe.
    const real = await prisma.publication.create({
      data: { workspaceId: workspace.id, title: "O livro de verdade" },
    });
    const stored = await storage.put({
      workspaceId: workspace.id,
      content: fixtureBytes("book-a.pdf"),
      mimeType: "application/pdf",
      originalFilename: "book-a.pdf",
    });
    const { id: sourceId } = await createAsset({
      ...stored,
      kind: "SOURCE_PDF",
      mimeType: "application/pdf",
      originalFilename: "book-a.pdf",
      width: null,
      height: null,
      workspaceId: workspace.id,
      publicationId: real.id,
    });
    await prisma.publication.update({
      where: { id: real.id },
      data: { sourcePdfAssetId: sourceId },
    });

    await deletePublication(new PrismaPublicationRepository(), storage, ensaio.id, {
      title: ensaio.title,
    });

    expect(await storage.exists(asStorageKey(stored.storageKey))).toBe(true);
    const content = await storage.get(asStorageKey(stored.storageKey));
    expect(content.content.byteLength).toBe(fixtureBytes("book-a.pdf").byteLength);
  });

  it("o arquivo que só o livro usava sai do disco, e a linha dele sai do banco", async () => {
    const { deletePublication } =
      await import("@modules/publications/application/manage-publications");
    const { PrismaPublicationRepository } =
      await import("@modules/publications/infrastructure/prisma-publication-repository");

    const { prisma, storage, publication, asset } = await seedBookWithSource(
      "book-c.pdf",
      "sozinho",
    );

    await deletePublication(new PrismaPublicationRepository(), storage, publication.id, {
      title: publication.title,
    });

    expect(await storage.exists(asStorageKey(asset.storageKey))).toBe(false);
    // Antes a linha ficava, com `publicationId` nulo, apontando para um arquivo que já não existe.
    expect(await prisma.asset.count({ where: { id: asset.id } })).toBe(0);
  });
});

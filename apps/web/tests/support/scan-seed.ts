import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { fixtureBytes } from "./scan-fixtures";

/**
 * Um livro com PDF fonte num banco temporário e num storage temporário — o ponto de partida dos
 * testes do scan contra as peças de verdade. Chamar **depois** de `createTempDatabase()`.
 */
export async function seedBookWithSource(fixture: string, slug: string) {
  const { prisma } = await import("@infrastructure/database/sqlite/client");
  const { LocalFileStorageProvider } = await import(
    "@infrastructure/storage/local/local-file-storage-provider"
  );

  const storage = new LocalFileStorageProvider({
    rootDir: mkdtempSync(path.join(tmpdir(), "lbb-test-storage-")),
  });
  const workspace = await prisma.workspace.create({ data: { name: slug, slug } });
  const publication = await prisma.publication.create({
    data: { workspaceId: workspace.id, title: fixture },
  });
  const stored = await storage.put({
    workspaceId: workspace.id,
    content: fixtureBytes(fixture),
    mimeType: "application/pdf",
    originalFilename: fixture,
  });
  const asset = await prisma.asset.create({
    data: {
      workspaceId: workspace.id,
      publicationId: publication.id,
      kind: "SOURCE_PDF",
      storageKey: stored.storageKey,
      mimeType: "application/pdf",
      originalFilename: fixture,
      sha256: stored.sha256,
      sizeBytes: stored.sizeBytes,
    },
  });
  await prisma.publication.update({
    where: { id: publication.id },
    data: { sourcePdfAssetId: asset.id },
  });

  return { prisma, storage, workspace, publication, asset };
}

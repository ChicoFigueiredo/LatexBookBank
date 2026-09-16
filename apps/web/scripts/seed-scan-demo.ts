import { readFile } from "node:fs/promises";
import path from "node:path";

import { PrismaLibSql } from "@prisma/adapter-libsql";

import { PrismaClient } from "../src/generated/prisma/client.ts";
import { LocalFileStorageProvider } from "../src/infrastructure/storage/local/local-file-storage-provider.ts";

/**
 * A biblioteca "Demonstração do scan": três livros com PDF fonte já anexado, feitos dos PDFs
 * sintéticos da D48 — um livro-texto com sumário, uma prova no formato do ENEM e o livro com o
 * exercício que vira a página. É para experimentar o scan sem apontar para o acervo real.
 *
 * Idempotente: roda de novo e não duplica (a biblioteca é achada pelo slug, os livros pelo título).
 *
 *     bun run scripts/seed-scan-demo.ts
 */

const SLUG = "demonstracao-do-scan";
const BOOKS = [
  { title: "Matemática Sintética", file: "livro-sintetico.pdf", profile: "book-v1" },
  { title: "ENEM sintético — 2º dia", file: "enem-sintetico.pdf", profile: "exam-enem-v1" },
  { title: "Sequências (exercício que vira a página)", file: "book-c.pdf", profile: "book-v1" },
] as const;

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  const storageRoot = process.env["STORAGE_ROOT"];
  if (!url) throw new Error("DATABASE_URL ausente. Rode `bun run setup`.");
  if (!storageRoot) throw new Error("STORAGE_ROOT ausente.");

  const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  const storage = new LocalFileStorageProvider({ rootDir: storageRoot });
  const fixtures = path.join(import.meta.dirname, "..", "tests", "fixtures", "scan");

  try {
    const workspace =
      (await prisma.workspace.findUnique({ where: { slug: SLUG } })) ??
      (await prisma.workspace.create({
        data: {
          name: "Demonstração do scan",
          slug: SLUG,
          description: "Livros sintéticos para experimentar o scan estrutural.",
        },
      }));

    for (const book of BOOKS) {
      const existing = await prisma.publication.findFirst({
        where: { workspaceId: workspace.id, title: book.title },
      });
      if (existing?.sourcePdfAssetId) {
        console.log(`= ${book.title} (já existe)`);
        continue;
      }

      const content = new Uint8Array(await readFile(path.join(fixtures, book.file)));
      const stored = await storage.put({
        workspaceId: workspace.id,
        content,
        mimeType: "application/pdf",
        originalFilename: book.file,
      });

      await prisma.$transaction(async (tx) => {
        const publication =
          existing ??
          (await tx.publication.create({
            data: { workspaceId: workspace.id, title: book.title, captureProfileId: book.profile },
          }));
        const asset = await tx.asset.create({
          data: {
            workspaceId: workspace.id,
            publicationId: publication.id,
            kind: "SOURCE_PDF",
            storageKey: stored.storageKey,
            mimeType: "application/pdf",
            originalFilename: book.file,
            sha256: stored.sha256,
            sizeBytes: stored.sizeBytes,
          },
        });
        await tx.publication.update({
          where: { id: publication.id },
          data: { sourcePdfAssetId: asset.id },
        });
        console.log(`+ ${book.title} → ${publication.id}`);
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

await main();

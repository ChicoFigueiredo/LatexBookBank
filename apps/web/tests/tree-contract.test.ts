import { afterAll, beforeAll, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import type { PrismaDocumentTreeRepository } from "@modules/document-tree/infrastructure/prisma-document-tree-repository";

import { InMemoryTree } from "./support/in-memory-tree";
import { createTempDatabase } from "./support/temp-database";
import { contratoDaArvore } from "./support/tree-contract";

// Monta um SQLite com as migrações: sozinho leva um ou dois segundos, e com a suíte inteira em
// paralelo passa dos 5 s padrão.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * O mesmo contrato da árvore contra o dublê em memória e contra o Prisma num SQLite com as
 * migrações reais (TST-05). Se o dublê divergir do banco, um dos dois lados fica vermelho.
 */

let sequencia = 0;

contratoDaArvore("em memória", () => {
  const tree = new InMemoryTree();
  return {
    deps: { reader: tree, writer: tree },
    novaPublicacao: async () => `pub-${++sequencia}`,
  };
});

let dispose: () => Promise<void>;
let prisma: PrismaClient;
let repository: PrismaDocumentTreeRepository;

beforeAll(async () => {
  const db = await createTempDatabase();
  dispose = db.dispose;

  // Depois do banco: o cliente Prisma lê `DATABASE_URL` ao ser importado.
  ({ prisma } = await import("@infrastructure/database/sqlite/client"));
  const { PrismaDocumentTreeRepository } =
    await import("@modules/document-tree/infrastructure/prisma-document-tree-repository");
  repository = new PrismaDocumentTreeRepository();
});

afterAll(async () => {
  await dispose();
});

contratoDaArvore("Prisma + SQLite", () => ({
  deps: { reader: repository, writer: repository },
  async novaPublicacao() {
    sequencia += 1;
    const workspace = await prisma.workspace.create({
      data: { name: `Contrato ${sequencia}`, slug: `contrato-${sequencia}` },
    });
    const publication = await prisma.publication.create({
      data: { workspaceId: workspace.id, title: `Livro ${sequencia}` },
    });
    return publication.id;
  },
}));

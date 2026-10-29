import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";

import { createTempDatabase } from "./support/temp-database";

// Monta um SQLite com as migrações: sozinho leva um ou dois segundos, e com a suíte inteira em
// paralelo passa dos 5 s padrão.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * O módulo de revisões contra um SQLite com as migrações reais (ARQ-04 da revisão de 2026-09-23).
 *
 * A numeração mora num lugar só, e quem muda o corpo de um nó por fora do editor (a aprovação do
 * scan, a retirada de uma importação) grava pelo mesmo `appendNodeRevision` que o editor usa. O
 * que se prova aqui é o contrato: número seguido por entidade, contado de quem quer que tenha
 * gravado antes, e o snapshot do nó sempre no mesmo formato.
 */

let dispose: () => Promise<void>;
let prisma: PrismaClient;

beforeAll(async () => {
  const db = await createTempDatabase();
  dispose = db.dispose;
  ({ prisma } = await import("@infrastructure/database/sqlite/client"));
});

afterAll(async () => {
  await dispose();
});

describe("revisões", () => {
  it("numeram por entidade, e cada gravador continua a contagem do outro", async () => {
    const { appendRevision } =
      await import("@modules/revisions/infrastructure/prisma-revision-writer");
    const { findRevision, listRevisions } =
      await import("@modules/revisions/infrastructure/prisma-revision-reader");
    const { appendNodeRevision, PrismaNodeBodyRepository } =
      await import("@modules/document-tree/infrastructure/prisma-node-body");

    const workspace = await prisma.workspace.create({ data: { name: "R", slug: "revisoes" } });
    const publication = await prisma.publication.create({
      data: { workspaceId: workspace.id, title: "Livro" },
    });
    const node = await prisma.documentNode.create({
      data: { publicationId: publication.id, kind: "SECTION", title: "1.1", sortKey: "a0" },
    });

    // O editor grava a primeira; o scan, a segunda — por fora do editor, com o mesmo formato.
    const bodies = new PrismaNodeBodyRepository();
    const saved = await bodies.save({
      nodeId: node.id,
      expectedUpdatedAt: node.updatedAt,
      bodyLatex: "Teoria.",
      summary: "edição",
      previous: { title: "1.1", bodyLatex: "" },
    });
    expect(saved?.bodyLatex).toBe("Teoria.");

    const second = await prisma.$transaction((tx) =>
      appendNodeRevision(tx, {
        nodeId: node.id,
        origin: "SYSTEM",
        summary: "corpo recebido do scan",
        // Campo a mais (a questão do nó, que a retirada da importação lê junto) não vai ao snapshot.
        snapshot: { title: "1.1", bodyLatex: "Teoria.", question: null } as never,
      }),
    );
    expect(second).toBe(2);

    // O mesmo id em outra entidade começa do 1: a numeração é por (tipo, id).
    const asQuestion = await prisma.$transaction((tx) =>
      appendRevision(tx, {
        entityType: "QUESTION",
        entityId: node.id,
        origin: "AGENT",
        agentRunId: "turno-1",
        summary: "patch",
        snapshotJson: "{}",
      }),
    );
    expect(asQuestion).toBe(1);

    const history = await bodies.listRevisions(node.id);
    expect(history.map((r) => [r.revisionNumber, r.origin, JSON.parse(r.snapshotJson)])).toEqual([
      [2, "SYSTEM", { title: "1.1", bodyLatex: "Teoria." }],
      [1, "USER", { title: "1.1", bodyLatex: "" }],
    ]);

    expect((await listRevisions("QUESTION", node.id)).map((r) => r.summary)).toEqual(["patch"]);
    expect(await findRevision("DOCUMENT_NODE", node.id, 3)).toBeNull();
    expect((await findRevision("QUESTION", node.id, 1))?.origin).toBe("AGENT");
  });
});

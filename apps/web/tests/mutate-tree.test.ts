import { beforeEach, describe, expect, it } from "vitest";

import {
  DeletedAncestorError,
  createNode,
  deleteNode,
  moveNode,
  renameNode,
  restoreNode,
} from "@modules/document-tree/application/mutate-tree";
import type {
  DeletedNodeRecord,
  DocumentTreeRepository,
  DocumentTreeWriter,
  NewNode,
  TreeNodeRecord,
} from "@modules/document-tree/domain/document-tree-repository";
import { CyclicMoveError, NodeNotFoundError } from "@modules/document-tree/domain/tree-mutations";

/**
 * Use cases exercitados contra um repositório **em memória**.
 *
 * Não é atalho para evitar o banco: é a demonstração do critério arquitetural da auditoria §47 —
 * o use case não sabe onde executa. O mesmo teste vale quando o motor virar PostgreSQL na Fase
 * 6.5, e é por isso que ele não usa Prisma.
 */

interface Row {
  id: string;
  parentId: string | null;
  title: string | null;
  sortKey: string;
  deletedAt: Date | null;
}

class InMemoryTree implements DocumentTreeRepository, DocumentTreeWriter {
  private rows: Row[] = [];
  private sequence = 0;

  constructor(seed: readonly Omit<Row, "deletedAt">[] = []) {
    this.rows = seed.map((row) => ({ ...row, deletedAt: null }));
  }

  snapshot(): readonly Row[] {
    return this.rows.map((row) => ({ ...row }));
  }

  async listByPublication(): Promise<readonly TreeNodeRecord[]> {
    return this.rows
      .filter((row) => row.deletedAt === null)
      .sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0))
      .map((row) => ({
        id: row.id,
        parentId: row.parentId,
        kind: "SECTION" as const,
        title: row.title,
        sortKey: row.sortKey,
        numberingStyle: "ARABIC" as const,
        originalLabel: null,
        question: null,
      }));
  }

  async create(node: NewNode): Promise<string> {
    const id = `novo-${++this.sequence}`;
    this.rows.push({
      id,
      parentId: node.parentId,
      title: node.title,
      sortKey: node.sortKey,
      deletedAt: null,
    });
    return id;
  }

  async rename(nodeId: string, title: string | null): Promise<void> {
    const row = this.rows.find((r) => r.id === nodeId);
    if (row) row.title = title;
  }

  async move(nodeId: string, parentId: string | null, sortKey: string): Promise<void> {
    const row = this.rows.find((r) => r.id === nodeId);
    if (row) {
      row.parentId = parentId;
      row.sortKey = sortKey;
    }
  }

  async softDeleteMany(nodeIds: readonly string[]): Promise<void> {
    const now = new Date("2026-08-07T18:00:00.000Z");
    for (const row of this.rows) if (nodeIds.includes(row.id)) row.deletedAt = now;
  }

  async restoreMany(nodeIds: readonly string[]): Promise<void> {
    for (const row of this.rows) if (nodeIds.includes(row.id)) row.deletedAt = null;
  }

  async listDeleted(): Promise<readonly DeletedNodeRecord[]> {
    return this.rows
      .filter((row) => row.deletedAt !== null)
      .map((row) => ({
        id: row.id,
        parentId: row.parentId,
        title: row.title,
        kind: "SECTION" as const,
        deletedAt: row.deletedAt as Date,
      }));
  }
}

/**
 * cap1 ─ sec1 ─ sub1
 *      └ sec2
 * cap2
 */
const seed = () =>
  new InMemoryTree([
    { id: "cap1", parentId: null, title: "Capítulo 1", sortKey: "a0" },
    { id: "cap2", parentId: null, title: "Capítulo 2", sortKey: "a1" },
    { id: "sec1", parentId: "cap1", title: "Seção 1.1", sortKey: "a0" },
    { id: "sec2", parentId: "cap1", title: "Seção 1.2", sortKey: "a1" },
    { id: "sub1", parentId: "sec1", title: "Sub", sortKey: "a0" },
  ]);

let tree: InMemoryTree;
let deps: { reader: DocumentTreeRepository; writer: DocumentTreeWriter };

beforeEach(() => {
  tree = seed();
  deps = { reader: tree, writer: tree };
});

const PUB = "pub-1";

describe("criar", () => {
  it("cria filho no fim, depois dos irmãos existentes", async () => {
    const id = await createNode(deps, {
      publicationId: PUB,
      kind: "SECTION",
      title: "Seção 1.3",
      placement: { kind: "lastChild", parentId: "cap1" },
    });

    const created = tree.snapshot().find((row) => row.id === id);
    expect(created?.parentId).toBe("cap1");
    expect(created?.sortKey && created.sortKey > "a1").toBe(true);
  });

  it("cria irmão exatamente na fresta entre dois nós", async () => {
    const id = await createNode(deps, {
      publicationId: PUB,
      kind: "SECTION",
      title: "Entremeio",
      placement: { kind: "after", siblingId: "sec1" },
    });

    const created = tree.snapshot().find((row) => row.id === id);
    expect(created?.parentId).toBe("cap1");
    expect(created?.sortKey && "a0" < created.sortKey && created.sortKey < "a1").toBe(true);
  });

  it("recusa criar sob pai inexistente", async () => {
    await expect(
      createNode(deps, {
        publicationId: PUB,
        kind: "SECTION",
        title: "Órfão",
        placement: { kind: "lastChild", parentId: "fantasma" },
      }),
    ).rejects.toThrow(NodeNotFoundError);
  });
});

describe("renomear", () => {
  it("troca o título", async () => {
    await renameNode(deps, PUB, "sec1", "Conceitos iniciais");
    expect(tree.snapshot().find((r) => r.id === "sec1")?.title).toBe("Conceitos iniciais");
  });

  it("recusa nó inexistente em vez de criar linha nova", async () => {
    await expect(renameNode(deps, PUB, "fantasma", "x")).rejects.toThrow(NodeNotFoundError);
  });
});

describe("mover", () => {
  it("move para outro pai", async () => {
    await moveNode(deps, PUB, "sec1", { kind: "lastChild", parentId: "cap2" });
    expect(tree.snapshot().find((r) => r.id === "sec1")?.parentId).toBe("cap2");
  });

  it("recusa mover para dentro da própria descendência, sem gravar nada", async () => {
    const before = tree.snapshot();

    await expect(
      moveNode(deps, PUB, "cap1", { kind: "lastChild", parentId: "sub1" }),
    ).rejects.toThrow(CyclicMoveError);

    expect(tree.snapshot()).toEqual(before);
  });

  it("reordenar entre irmãos não muda o pai", async () => {
    await moveNode(deps, PUB, "sec2", { kind: "before", siblingId: "sec1" });

    const moved = tree.snapshot().find((r) => r.id === "sec2");
    expect(moved?.parentId).toBe("cap1");
    expect(moved?.sortKey && moved.sortKey < "a0").toBe(true);
  });
});

describe("excluir", () => {
  it("marca o nó e toda a descendência", async () => {
    const removed = await deleteNode(deps, PUB, "cap1");

    expect([...removed].sort()).toEqual(["cap1", "sec1", "sec2", "sub1"]);
    const alive = tree.snapshot().filter((r) => r.deletedAt === null);
    expect(alive.map((r) => r.id)).toEqual(["cap2"]);
  });

  it("um filho excluído junto não fica órfão nem invisível", async () => {
    await deleteNode(deps, PUB, "sec1");

    const deleted = await tree.listDeleted();
    expect([...deleted.map((d) => d.id)].sort()).toEqual(["sec1", "sub1"]);
  });
});

describe("restaurar", () => {
  it("traz de volta o nó e a descendência excluída junto", async () => {
    await deleteNode(deps, PUB, "sec1");
    const restored = await restoreNode(deps, PUB, "sec1");

    expect([...restored].sort()).toEqual(["sec1", "sub1"]);
    expect((await tree.listDeleted()).length).toBe(0);
  });

  it("recusa restaurar com o ancestral ainda excluído, em vez de devolver um nó invisível", async () => {
    await deleteNode(deps, PUB, "cap1");

    await expect(restoreNode(deps, PUB, "sec1")).rejects.toThrow(DeletedAncestorError);
    expect((await tree.listDeleted()).length).toBe(4);
  });

  it("um filho excluído à parte, antes, não volta de carona", async () => {
    await deleteNode(deps, PUB, "sub1");
    await deleteNode(deps, PUB, "sec2");

    const restored = await restoreNode(deps, PUB, "sec2");

    expect(restored).toEqual(["sec2"]);
    expect((await tree.listDeleted()).map((d) => d.id)).toEqual(["sub1"]);
  });

  it("recusa restaurar o que não está na lixeira", async () => {
    await expect(restoreNode(deps, PUB, "cap2")).rejects.toThrow(NodeNotFoundError);
  });
});

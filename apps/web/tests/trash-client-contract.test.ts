import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { useTempStorage } from "./support/asset-routes";
import { installRouteFetch, type RouteEntry } from "./support/route-fetch";
import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * O cliente da lixeira contra as rotas de verdade (ADR 0010).
 *
 * A tela da lixeira lia três respostas com a forma escrita à mão, a última com
 * `as { held?… }`. Aqui o `trashApi` faz o que ela faz — contar, restaurar, levar a recusa,
 * esvaziar — contra os Route Handlers, um SQLite e um storage temporários. O banco é deste
 * arquivo: a lixeira é do acervo inteiro, e um banco dividido contaria a de outro teste.
 */

const ROUTES: readonly RouteEntry[] = [
  ["GET", "/api/trash", () => import("../app/api/trash/route")],
  ["DELETE", "/api/trash", () => import("../app/api/trash/route")],
  [
    "POST",
    "/api/publications/:id/nodes/:nodeId/restore",
    () => import("../app/api/publications/[id]/nodes/[nodeId]/restore/route"),
  ],
];

let dispose: () => Promise<void>;
let restore: () => void = () => {};

beforeAll(async () => {
  dispose = (await createTempDatabase()).dispose;
  await useTempStorage();
});

afterAll(async () => {
  await dispose();
});

afterEach(() => restore());

describe("o cliente da lixeira fala a língua das rotas", () => {
  it("conta, restaura, leva a recusa e esvazia", async () => {
    const { prisma } = await import("@infrastructure/database/sqlite/client");
    const { PrismaDocumentTreeRepository } =
      await import("@modules/document-tree/infrastructure/prisma-document-tree-repository");
    const { createNode, deleteNode } =
      await import("@modules/document-tree/application/mutate-tree");
    const repository = new PrismaDocumentTreeRepository();
    const deps = { reader: repository, writer: repository };

    const workspace = await prisma.workspace.create({ data: { name: "lixeira", slug: "lixeira" } });
    const publication = await prisma.publication.create({
      data: { workspaceId: workspace.id, title: "Livro" },
    });
    const secao = (title: string) =>
      createNode(deps, {
        publicationId: publication.id,
        kind: "SECTION",
        title,
        placement: { kind: "lastChild", parentId: null },
      });
    const volta = await secao("Volta");
    const sai = await secao("Sai");
    await deleteNode(deps, publication.id, volta);
    await deleteNode(deps, publication.id, sai);

    restore = installRouteFetch(ROUTES).restore;
    const { trashApi } = await import("@modules/document-tree/ui/trash-client");

    const antes = await trashApi.summary();
    expect(antes.ok).toBe(true);
    expect(antes.body).toMatchObject({ itemCount: 2, objectCount: 2 });
    expect(antes.body.footer).toEqual(expect.any(String));

    const restaurado = await trashApi.restore(publication.id, volta);
    expect(restaurado.ok).toBe(true);
    expect(restaurado.body.restored).toEqual([volta]);

    const recusa = await trashApi.restore(publication.id, "nao-existe");
    expect(recusa.ok).toBe(false);
    expect(recusa.body.message).toEqual(expect.any(String));

    expect((await trashApi.summary()).body.objectCount).toBe(1);

    const esvaziado = await trashApi.empty();
    expect(esvaziado.ok).toBe(true);
    expect(esvaziado.body.deleted).toEqual({ nodes: 1, questions: 0 });
    expect(esvaziado.body.held).toEqual([]);

    expect((await trashApi.summary()).body.objectCount).toBe(0);
    const vivos = await prisma.documentNode.findMany({ where: { publicationId: publication.id } });
    expect(vivos.map((node) => node.id)).toEqual([volta]);
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { seedLibrary } from "./support/assessment-seed";
import { installRouteFetch, type RouteEntry } from "./support/route-fetch";
import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * O *Conferido* do corpo do nó contra a rota de verdade (ADR 0010, D74).
 *
 * A tela chamava `fetch` direto num caminho em português (`body/conferido`). Agora o caminho é
 * `body/confirm`, e quem o monta é o `nodeBodyApi`: se rota e cliente divergirem no caminho, é
 * aqui que quebra — a rota de teste só conhece o caminho novo.
 */

const ROUTES: readonly RouteEntry[] = [
  [
    "POST",
    "/api/publications/:id/nodes/:nodeId/body/confirm",
    () => import("../app/api/publications/[id]/nodes/[nodeId]/body/confirm/route"),
  ],
];

let dispose: () => Promise<void>;
let restore: () => void = () => {};

beforeAll(async () => {
  dispose = (await createTempDatabase()).dispose;
});

afterAll(async () => {
  await dispose();
});

afterEach(() => restore());

describe("o cliente do corpo do nó fala a língua da rota", () => {
  it("confere o corpo de um exemplo e grava a revisão", async () => {
    const { prisma, publication } = await seedLibrary("corpo-confirm-1");
    const example = await prisma.documentNode.create({
      data: {
        publicationId: publication.id,
        kind: "EXAMPLE",
        sortKey: "a0",
        bodyLatex: "Exemplo que o scan escreveu.",
      },
      select: { id: true },
    });
    const { calls, restore: undo } = installRouteFetch(ROUTES);
    restore = undo;
    const { nodeBodyApi } = await import("@modules/document-tree/ui/node-body-client");

    const reply = await nodeBodyApi.confirm(publication.id, example.id);

    expect(reply.ok).toBe(true);
    expect(reply.body.confirmed).toBe(true);
    expect(new URL(calls[0]!.url).pathname).toBe(
      `/api/publications/${publication.id}/nodes/${example.id}/body/confirm`,
    );
  });

  it("a recusa volta lida, sem lançar: a tela recarrega do mesmo jeito", async () => {
    const library = await seedLibrary("corpo-confirm-2");
    const { nodeId } = await library.question({ type: "DISCURSIVE", statement: "Enunciado." });
    restore = installRouteFetch(ROUTES).restore;
    const { nodeBodyApi } = await import("@modules/document-tree/ui/node-body-client");

    const reply = await nodeBodyApi.confirm(library.publication.id, nodeId);

    expect(reply.ok).toBe(false);
    expect(reply.status).toBeGreaterThanOrEqual(400);
    expect(reply.body.message).toMatch(/enunciado/);
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { useTempStorage } from "./support/asset-routes";
import { installRouteFetch, type RouteEntry } from "./support/route-fetch";
import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * O cliente do import contra a rota de verdade (ADR 0010).
 *
 * A tela de importar lia a simulação com a forma escrita à mão (`DryRunResult`), e com um
 * manifesto que a rota nunca mandou (`workspaceName`). Aqui o `importApi` faz o que ela faz —
 * ensaiar, levar a recusa da colisão sem aceite, gravar como cópia — com um `.lbb` exportado do
 * próprio banco temporário, que colide consigo mesmo pelo ISBN.
 */

const ROUTES: readonly RouteEntry[] = [
  ["GET", "/api/workspaces/export", () => import("../app/api/workspaces/export/route")],
  ["POST", "/api/workspaces/import", () => import("../app/api/workspaces/import/route")],
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

describe("o cliente do import fala a língua da rota", () => {
  it("ensaia, recusa a colisão sem aceite, grava como cópia com ele", async () => {
    const { prisma } = await import("@infrastructure/database/sqlite/client");
    const workspace = await prisma.workspace.create({
      data: { name: "Origem", slug: "origem-import" },
    });
    await prisma.publication.create({
      data: { workspaceId: workspace.id, title: "Álgebra", isbn: "9788535716801" },
    });
    restore = installRouteFetch(ROUTES).restore;
    const { importApi } = await import("@modules/portability/ui/import-client");
    const { ApiError } = await import("@/shared/http/api-client");

    const exported = await fetch(`/api/workspaces/export?workspaceId=${workspace.id}`);
    expect(exported.ok).toBe(true);
    const archive = new Blob([await exported.arrayBuffer()], { type: "application/zip" });

    const ensaio = await importApi.simulate(archive);
    expect(ensaio.dryRun).toBe(true);
    expect(ensaio.wouldCreate.publications).toBe(1);
    expect(ensaio.sizeBytes).toBe(archive.size);
    expect(ensaio.manifest.workspace.name).toBe("Origem");
    expect(ensaio.conflicts.map((conflict) => conflict.title)).toContain("Álgebra");

    const recusa = await importApi
      .run(archive, { acceptCollisions: false })
      .catch((error: unknown) => error);
    expect(recusa).toBeInstanceOf(ApiError);
    expect((recusa as InstanceType<typeof ApiError>).status).toBe(409);
    expect((recusa as InstanceType<typeof ApiError>).body.error).toBe("collisions_need_decision");
    expect((recusa as InstanceType<typeof ApiError>).serverMessage).toMatch(/colide/);

    const gravado = await importApi.run(archive, { acceptCollisions: true });
    expect(gravado.dryRun).toBe(false);
    expect(gravado.report.publications).toBe(1);
    const copia = await prisma.workspace.findUniqueOrThrow({
      where: { id: gravado.report.workspaceId },
    });
    expect(copia.id).not.toBe(workspace.id);
  });

  it("arquivo vazio é recusa com a mensagem da rota", async () => {
    restore = installRouteFetch(ROUTES).restore;
    const { importApi } = await import("@modules/portability/ui/import-client");
    const { ApiError } = await import("@/shared/http/api-client");

    const recusa = await importApi.simulate(new Blob([])).catch((error: unknown) => error);

    expect(recusa).toBeInstanceOf(ApiError);
    expect((recusa as InstanceType<typeof ApiError>).status).toBe(400);
    expect((recusa as InstanceType<typeof ApiError>).serverMessage).toMatch(/\.lbb/);
  });
});

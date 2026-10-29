import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ScanRunner } from "@modules/scan/application/scan-store";

import { installRouteFetch } from "./support/route-fetch";
import { seedBookWithSource } from "./support/scan-seed";
import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * O `ScanRunView` da tela é o `ScanRunDto` da rota (tarefa I8 · STE-16 e ARQ-10 da revisão de
 * 2026-09-23). Antes a tela redeclarava a execução campo a campo; o `tsc` agora liga os dois pelo
 * tipo, e este teste liga o resto: o `scanApi.get` contra o Route Handler, com banco real.
 */

const sha256 = async (text: string) => createHash("sha256").update(text).digest("hex");
const idle: ScanRunner = { ensure: () => undefined, isRunning: () => false };

let dispose: () => Promise<void>;
let restore: () => void = () => {};

beforeAll(async () => {
  dispose = (await createTempDatabase()).dispose;
});

afterAll(async () => {
  await dispose();
});

afterEach(() => restore());

describe("o cliente do scan lê a execução que a rota manda", () => {
  it("estado com rótulo, datas em ISO e o que só o servidor sabe (rodando, interrompida)", async () => {
    const { publication } = await seedBookWithSource("book-a.pdf", "scan-contrato");
    const { PrismaScanStore, PrismaScanSources } =
      await import("@modules/scan/infrastructure/prisma-scan-store");
    const { startScan } = await import("@modules/scan/application/start-scan");
    const { run } = await startScan(
      { store: new PrismaScanStore(), runner: idle, sources: new PrismaScanSources(), sha256 },
      { publicationId: publication.id, profileId: "book-v1", recognizeMath: "never" },
    );

    restore = installRouteFetch([
      ["GET", "/api/scans/:runId", () => import("../app/api/scans/[runId]/route")],
    ]).restore;
    const { scanApi } = await import("@modules/scan/ui/scan-client");

    const { run: view, items } = await scanApi.get(run.id, false);

    expect(view.id).toBe(run.id);
    expect(view.publicationId).toBe(publication.id);
    expect(view.state).toBe(run.state);
    expect(view.stateLabel).toEqual(expect.any(String));
    expect(view.stateLabel).not.toBe("");
    expect(view.running).toBe(false);
    expect(typeof view.interrupted).toBe("boolean");
    expect(new Date(view.createdAt).toISOString()).toBe(view.createdAt);
    expect(view.settings).toEqual(run.settings);
    expect(items).toEqual([]);
  });

  it("execução que não existe é ScanRequestError com o status da rota", async () => {
    restore = installRouteFetch([
      ["GET", "/api/scans/:runId", () => import("../app/api/scans/[runId]/route")],
    ]).restore;
    const { scanApi, ScanRequestError } = await import("@modules/scan/ui/scan-client");

    const failure = await scanApi.get("nao-existe", false).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ScanRequestError);
    expect((failure as InstanceType<typeof ScanRequestError>).status).toBe(404);
  });
});

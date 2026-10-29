import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { MAX_ARCHIVE_BYTES } from "@modules/portability/domain/portable-archive";

import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * O corpo da rota de import tem o teto do leitor do `.lbb` (SEC-03, G3 da revisão de código).
 *
 * A rota cortava em 512 MB e o leitor aceitava 2 GB: o que a exportação gerava entre os dois era
 * recusado pelo próprio app. O teto é um só, `MAX_ARCHIVE_BYTES`, e a rota o lê de lá.
 */

let dispose: () => Promise<void>;
beforeAll(async () => {
  dispose = (await createTempDatabase()).dispose;
});
afterAll(async () => {
  await dispose();
});

const post = (declared: number) =>
  new Request("http://127.0.0.1/api/workspaces/import?dryRun=1", {
    method: "POST",
    body: null,
    headers: { "content-length": String(declared) },
  });

describe("o teto do corpo do import", () => {
  it("o proxy do Next guarda o corpo inteiro até o mesmo teto", async () => {
    // Com `proxy.ts`, o Next corta o corpo guardado em 10 MB sem avisar a rota: o `.lbb` chegava
    // truncado e voltava "corrompido".
    const { default: config } = await import("../next.config");

    expect(config.experimental?.proxyClientMaxBodySize).toBe(MAX_ARCHIVE_BYTES);
  });

  it("aceita declarar exatamente o teto do leitor", async () => {
    const { POST } = await import("../app/api/workspaces/import/route");

    const response = await POST(post(MAX_ARCHIVE_BYTES));

    // Passou do teto; o que recusa agora é o corpo vazio.
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "bad_request" });
  });

  it("recusa com 413 um byte acima, sem ler o corpo", async () => {
    const { POST } = await import("../app/api/workspaces/import/route");

    const response = await POST(post(MAX_ARCHIVE_BYTES + 1));

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      error: "too_large",
      message: "O arquivo passa de 1024 MB.",
    });
  });
});

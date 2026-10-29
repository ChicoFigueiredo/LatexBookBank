import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { multipart, useTempStorage } from "./support/asset-routes";
import { seedBookWithSource } from "./support/scan-seed";
import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * O conteúdo servido não roda como página do app (#257, SEC-04 da revisão).
 *
 * Um SVG enviado, ou vindo de um `.lbb`, saía `inline` com `image/svg+xml` na origem do app. Dentro
 * de `<img>` o script dele não roda; aberto numa aba, rodava — com a API inteira ao alcance.
 */
describe("o conteúdo servido", () => {
  let dispose: () => Promise<void>;
  let storageRoot = "";
  beforeAll(async () => {
    dispose = (await createTempDatabase()).dispose;
    storageRoot = await useTempStorage();
  });
  afterAll(async () => {
    await dispose();
  });

  const SVG = `<svg xmlns="http://www.w3.org/2000/svg"><script>fetch('/api/libraries')</script></svg>`;

  async function subir(file: File): Promise<string> {
    const { workspace, publication } = await seedBookWithSource("book-a.pdf", crypto.randomUUID());
    const { POST } = await import("../app/api/assets/route");
    const response = await POST(
      multipart("/api/assets", {
        file,
        workspaceId: workspace.id,
        publicationId: publication.id,
      }),
    );
    expect(response.status).toBe(201);
    return ((await response.json()) as { id: string }).id;
  }

  async function servir(assetId: string): Promise<Response> {
    const { GET } = await import("../app/api/assets/[assetId]/content/route");
    return GET(new Request(`http://127.0.0.1:28080/api/assets/${assetId}/content`), {
      params: Promise.resolve({ assetId }),
    });
  }

  it("o SVG enviado vai em sandbox, sem script, e o navegador não adivinha o tipo", async () => {
    const id = await subir(new File([SVG], "figura.svg", { type: "image/svg+xml" }));

    const response = await servir(id);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("sandbox");
    expect(csp).toContain("default-src 'none'");
  });

  it("PNG e PDF seguem inline e sem sandbox, mas com nosniff", async () => {
    const png = await subir(new File(["png"], "foto.png", { type: "image/png" }));
    const pdf = await subir(new File(["%PDF-1.4"], "livro.pdf", { type: "application/pdf" }));

    for (const id of [png, pdf]) {
      const response = await servir(id);
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("content-security-policy")).toBeNull();
      expect(response.headers.get("content-disposition")).toMatch(/^inline;/);
    }
  });

  it("o artefato de render em SVG também vai em sandbox", async () => {
    const { prisma, workspace } = await seedBookWithSource("book-a.pdf", "artefato-svg");
    const { LocalFileStorageProvider } =
      await import("@infrastructure/storage/local/local-file-storage-provider");
    // O storage que a rota lê: o do ambiente.
    const storage = new LocalFileStorageProvider({ rootDir: storageRoot });
    const job = await prisma.renderJob.create({
      data: {
        workspaceId: workspace.id,
        contentHash: "hash-do-teste",
        profileId: "question-preview",
        rendererVersion: "0.0.0-teste",
        state: "SUCCEEDED",
        success: true,
      },
    });
    const stored = await storage.put({
      workspaceId: workspace.id,
      content: new TextEncoder().encode(SVG),
      mimeType: "image/svg+xml",
      originalFilename: "page-1.svg",
    });
    await prisma.asset.create({
      data: {
        workspaceId: workspace.id,
        renderJobId: job.id,
        kind: "RENDER_SVG",
        storageKey: stored.storageKey,
        mimeType: "image/svg+xml",
        originalFilename: "page-1.svg",
        sha256: stored.sha256,
        sizeBytes: stored.sizeBytes,
      },
    });

    const { GET } = await import("../app/api/render-jobs/[jobId]/artifacts/[name]/route");
    const response = await GET(new Request("http://127.0.0.1:28080/"), {
      params: Promise.resolve({ jobId: job.id, name: "page-1.svg" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy") ?? "").toContain("sandbox");
  });
});

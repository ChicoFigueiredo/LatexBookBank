import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_RENDER_OPTIONS,
  type RenderBundle,
  type RenderResult,
} from "@latexbookbank/render-contract";
import type { RenderExecutor, RenderOutcome, StorageProvider } from "@/shared/ports";

import { createTempDatabase } from "./support/temp-database";

// Monta um SQLite com as migrações: com a suíte em paralelo passa dos 5 s padrão.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * O cache de render contra o banco de verdade: a unicidade de `(workspaceId, contentHash)` só
 * existe nele, e é ela que duas abas compilando o mesmo conteúdo encontram.
 */

const bundle = (jobId: string): RenderBundle => ({
  jobId,
  sourceLatex: "Quanto é $2+2$?",
  profile: {
    id: "legacy",
    documentClass: "article",
    documentClassOptions: [],
    preamble: [],
    engine: "pdflatex",
  },
  assets: [],
  options: DEFAULT_RENDER_OPTIONS,
});

/** O worker, devagar o bastante para as duas compilações acharem o cache vazio. */
class SlowExecutor implements RenderExecutor {
  calls = 0;

  async render(sent: RenderBundle): Promise<RenderOutcome> {
    this.calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 50));
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, this.calls]);
    const result: RenderResult = {
      jobId: sent.jobId,
      success: true,
      pdf: null,
      png: [
        {
          name: "page-1.png",
          mimeType: "image/png",
          sizeBytes: png.length,
          sha256: "x".repeat(64),
          width: 1,
          height: 1,
        },
      ],
      diagnostics: [],
      stdout: "",
      stderr: "",
      durationMs: 50,
      rendererVersion: "teste",
    };
    return { result, artifacts: new Map([["page-1.png", png]]) };
  }
  async cancel() {}
  health(): never {
    throw new Error("não usado");
  }
}

let dispose: () => Promise<void>;
let storage: StorageProvider;
let workspaceId: string;

beforeAll(async () => {
  dispose = (await createTempDatabase()).dispose;
  const { prisma } = await import("@infrastructure/database/sqlite/client");
  const { LocalFileStorageProvider } =
    await import("@infrastructure/storage/local/local-file-storage-provider");

  storage = new LocalFileStorageProvider({
    rootDir: mkdtempSync(path.join(tmpdir(), "lbb-test-storage-")),
  });
  workspaceId = (await prisma.workspace.create({ data: { name: "cache", slug: "cache" } })).id;
});
afterAll(async () => {
  await dispose();
});

const run = async (executor: RenderExecutor, jobId: string, force = false) => {
  const { executeRender } = await import("@modules/rendering/application/execute-render");
  const { PrismaRenderJobRepository } =
    await import("@modules/rendering/infrastructure/prisma-render-job-repository");
  return executeRender(
    { workspaceId, questionId: null, bundle: bundle(jobId), force },
    { executor, storage, jobs: new PrismaRenderJobRepository(), rendererVersion: "teste" },
  );
};

describe("o mesmo conteúdo compilado em paralelo", () => {
  it("as duas respostas trazem o mesmo job, e nenhuma é erro", async () => {
    const executor = new SlowExecutor();

    const [first, second] = await Promise.all([run(executor, "aba-1"), run(executor, "aba-2")]);

    expect(executor.calls).toBe(2);
    expect(first.job.success).toBe(true);
    expect(second.job.id).toBe(first.job.id);
  });
});

describe("recompilar de verdade", () => {
  it("`force` troca o job do cache pelo novo, com os artefatos dele", async () => {
    const executor = new SlowExecutor();

    const cached = await run(executor, "editor-1");
    const forced = await run(executor, "editor-2", true);
    const after = await run(executor, "editor-3");

    expect(forced.cacheHit).toBe(false);
    expect(forced.job.id).not.toBe(cached.job.id);
    expect(after.cacheHit).toBe(true);
    expect(after.job.id).toBe(forced.job.id);
    expect(after.job.artifacts.map((artifact) => artifact.name)).toEqual(["page-1.png"]);
  });
});

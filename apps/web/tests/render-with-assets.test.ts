import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { RenderBundle } from "@latexbookbank/render-contract";
import { assetLatexName } from "@modules/assets/domain/asset-latex-name";
import { QUESTION_PREVIEW_PROFILE } from "@modules/rendering/domain/latex-profile";
import type { RenderExecutor, RenderOutcome, StorageProvider } from "@/shared/ports";

import { createTempDatabase } from "./support/temp-database";

// Monta um SQLite com as migrações: com a suíte em paralelo passa dos 5 s padrão.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * Toda compilação de questão leva as figuras que o corpo cita — a do editor, a do candidato que o
 * humano revisa e a do agente que testa antes de propor.
 *
 * O executor abaixo é a borda (o HTTP do worker), e se comporta como o `pdflatex` com
 * `-halt-on-error`: uma figura citada que não veio no bundle é "File not found", e nenhum PDF.
 */
class PdflatexLikeExecutor implements RenderExecutor {
  readonly bundles: { bundle: RenderBundle; assets: ReadonlyMap<string, Uint8Array> }[] = [];
  readonly cancelled: string[] = [];

  render(bundle: RenderBundle, assets: ReadonlyMap<string, Uint8Array> = new Map()) {
    this.bundles.push({ bundle, assets });

    const cited = [
      ...bundle.sourceLatex.matchAll(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g),
    ].map((match) => match[1] ?? "");
    const missing = cited.find(
      (name) => !assets.has(name) || !bundle.assets.some((asset) => asset.name === name),
    );

    const page = new Uint8Array([0x89, 0x50, 0x4e, 0x47, bundle.sourceLatex.length % 256]);
    const outcome: RenderOutcome = {
      result: {
        jobId: bundle.jobId,
        success: missing === undefined,
        durationMs: 5,
        rendererVersion: "teste",
        pdf: null,
        png:
          missing === undefined
            ? [
                {
                  name: "page-1.png",
                  mimeType: "image/png",
                  sizeBytes: page.length,
                  sha256: "x",
                  width: 10,
                  height: 10,
                },
              ]
            : [],
        diagnostics:
          missing === undefined
            ? []
            : [
                {
                  severity: "error",
                  message: `LaTeX Error: File \`${missing}' not found.`,
                  file: "main.tex",
                  line: 3,
                },
              ],
        stdout: "",
        stderr: "",
      } as RenderOutcome["result"],
      artifacts: missing === undefined ? new Map([["page-1.png", page]]) : new Map(),
    };
    return Promise.resolve(outcome);
  }

  cancel(jobId: string) {
    this.cancelled.push(jobId);
    return Promise.resolve();
  }

  health() {
    return Promise.reject(new Error("não usado"));
  }
}

let dispose: () => Promise<void>;
let storage: StorageProvider;
let questionId: string;
let figure: string;
/** Da questão, mas o texto salvo não cita: só viaja se o candidato citar. */
let spare: string;
/** Do livro (D58): o corpo do capítulo cita. */
let bookFigure: string;
let workspaceId: string;
let publicationId: string;

beforeAll(async () => {
  dispose = (await createTempDatabase()).dispose;

  const { prisma } = await import("@infrastructure/database/sqlite/client");
  const { LocalFileStorageProvider } =
    await import("@infrastructure/storage/local/local-file-storage-provider");

  storage = new LocalFileStorageProvider({
    rootDir: mkdtempSync(path.join(tmpdir(), "lbb-test-storage-")),
  });

  const workspace = await prisma.workspace.create({ data: { name: "enem", slug: "enem" } });
  const publication = await prisma.publication.create({
    data: { workspaceId: workspace.id, title: "ENEM 2023" },
  });
  workspaceId = workspace.id;
  publicationId = publication.id;

  /** Uma figura no storage e no banco; devolve o nome que o LaTeX cita. */
  const addFigure = async (
    filename: string,
    seed: number,
    owner: { questionId: string } | { publicationId: string },
  ) => {
    const stored = await storage.put({
      workspaceId: workspace.id,
      content: new Uint8Array([0x89, 0x50, 0x4e, 0x47, seed, 2, 3]),
      mimeType: "image/png",
      originalFilename: filename,
    });
    await prisma.asset.create({
      data: {
        workspaceId: workspace.id,
        ...owner,
        kind: "questionId" in owner ? "QUESTION_IMAGE" : "CROP",
        storageKey: stored.storageKey,
        mimeType: "image/png",
        originalFilename: filename,
        sha256: stored.sha256,
        sizeBytes: stored.sizeBytes,
      },
    });
    return assetLatexName({
      sha256: stored.sha256,
      mimeType: "image/png",
      originalFilename: filename,
    });
  };

  const question = await prisma.question.create({
    data: {
      type: "MULTIPLE_CHOICE",
      solutionLatex: "A taxa dobra.",
      options: {
        create: [
          { sortKey: "a0", statementLatex: "dobra", isCorrect: true },
          { sortKey: "a1", statementLatex: "cai", isCorrect: false },
        ],
      },
    },
  });
  questionId = question.id;
  await prisma.documentNode.create({
    data: { publicationId: publication.id, kind: "QUESTION", sortKey: "a0", questionId },
  });

  figure = await addFigure("figura-1-1.png", 1, { questionId });
  spare = await addFigure("grafico-b.png", 2, { questionId });
  await prisma.question.update({
    where: { id: questionId },
    data: {
      statementLatex: `Observe o gráfico.\n\n\\includegraphics[width=0.5\\linewidth]{${figure}}`,
    },
  });
  bookFigure = await addFigure("mapa-do-brasil.png", 3, { publicationId: publication.id });
});

afterAll(async () => {
  await dispose();
});

const loadSource = async () => {
  const { questionRenderSource } =
    await import("@modules/rendering/infrastructure/prisma-question-render-source");
  const source = await questionRenderSource(questionId, storage);
  if (source === null) throw new Error("a questão semeada sumiu");
  return source;
};

describe("o agente testa o candidato com as figuras da questão", () => {
  it("um candidato que só mexe na resolução compila, e a figura viaja no bundle", async () => {
    const { buildCandidateRenderTool } =
      await import("@modules/agents/application/render-candidate");
    const { questionRenderSource } =
      await import("@modules/rendering/infrastructure/prisma-question-render-source");

    const executor = new PdflatexLikeExecutor();
    const tool = buildCandidateRenderTool({
      executor,
      profile: QUESTION_PREVIEW_PROFILE,
      loadSource: () => questionRenderSource(questionId, storage),
    });

    const output = await tool.execute({ field: "solutionLatex", value: "A taxa cai pela metade." });

    expect(output).toMatch(/^Compilou/);
    expect(executor.bundles[0]?.assets.has(figure)).toBe(true);
  });
});

describe("o antes e o depois da revisão", () => {
  it("os dois lados compilam com a figura, cada um com o próprio jobId", async () => {
    const { compileDraft } = await import("@modules/rendering/application/render-document");
    const executor = new PdflatexLikeExecutor();
    const source = await loadSource();

    const [before, after] = await Promise.all([
      compileDraft({ executor }, source, {
        profile: QUESTION_PREVIEW_PROFILE,
        overrides: { solutionLatex: "A taxa dobra." },
        includeSolution: true,
      }),
      compileDraft({ executor }, source, {
        profile: QUESTION_PREVIEW_PROFILE,
        overrides: { solutionLatex: "A taxa cai pela metade." },
        includeSolution: true,
      }),
    ]);

    expect(before.result.success).toBe(true);
    expect(after.result.success).toBe(true);
    expect(after.sourceLatex).toContain("A taxa cai pela metade.");
    expect(executor.bundles.map(({ bundle }) => bundle.jobId)).toHaveLength(2);
    expect(new Set(executor.bundles.map(({ bundle }) => bundle.jobId)).size).toBe(2);
  });

  it("uma figura que só o candidato cita também viaja — e só ela, das que sobram", async () => {
    const { compileDraft } = await import("@modules/rendering/application/render-document");
    const executor = new PdflatexLikeExecutor();

    const { result } = await compileDraft({ executor }, await loadSource(), {
      profile: QUESTION_PREVIEW_PROFILE,
      overrides: { statementLatex: `Compare.\n\n\\includegraphics{${spare}}` },
    });

    expect(result.success).toBe(true);
    expect([...(executor.bundles[0]?.assets.keys() ?? [])]).toEqual([spare]);
  });

  it("desistir do pedido manda o worker parar aquele job", async () => {
    const { compileDraft } = await import("@modules/rendering/application/render-document");
    const executor = new PdflatexLikeExecutor();
    const controller = new AbortController();
    const render = executor.render.bind(executor);
    executor.render = (bundle, assets) => {
      controller.abort();
      return render(bundle, assets);
    };

    await compileDraft({ executor }, await loadSource(), {
      profile: QUESTION_PREVIEW_PROFILE,
      signal: controller.signal,
    });

    expect(executor.cancelled).toEqual([executor.bundles[0]?.bundle.jobId]);
  });
});

describe("o editor compila e guarda, com as figuras", () => {
  const deps = async (executor: RenderExecutor) => {
    const { PrismaRenderJobRepository } =
      await import("@modules/rendering/infrastructure/prisma-render-job-repository");
    return { executor, storage, jobs: new PrismaRenderJobRepository(), rendererVersion: "teste" };
  };

  it("a questão com figura compila, grava o job e devolve o corpo e o mapa", async () => {
    const { renderDocument } = await import("@modules/rendering/application/render-document");
    const executor = new PdflatexLikeExecutor();

    const rendered = await renderDocument(await deps(executor), await loadSource(), {
      profile: QUESTION_PREVIEW_PROFILE,
    });

    expect(rendered.job.success).toBe(true);
    expect(rendered.job.questionId).toBe(questionId);
    expect(rendered.job.artifacts.map((artifact) => artifact.name)).toEqual(["page-1.png"]);
    expect(rendered.sourceLatex).toContain(figure);
    expect(rendered.sourceMap.map((span) => span.origin)).toContain("statementLatex");
  });

  it("o corpo do capítulo leva a figura do livro", async () => {
    const { renderDocument } = await import("@modules/rendering/application/render-document");
    const { nodeRenderSource } =
      await import("@modules/rendering/infrastructure/prisma-question-render-source");
    const executor = new PdflatexLikeExecutor();

    const rendered = await renderDocument(
      await deps(executor),
      nodeRenderSource(
        { nodeId: "capitulo-1", bodyLatex: `O território.\n\n\\includegraphics{${bookFigure}}` },
        { id: publicationId, workspaceId },
        storage,
      ),
      { profile: QUESTION_PREVIEW_PROFILE },
    );

    expect(rendered.job.success).toBe(true);
    expect(rendered.job.questionId).toBeNull();
    expect(executor.bundles[0]?.assets.has(bookFigure)).toBe(true);
  });
});

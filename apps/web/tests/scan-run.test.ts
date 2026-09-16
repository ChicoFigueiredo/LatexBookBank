import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AiProvider } from "@shared/ports/ai-provider";
import { MathRecognitionError, type MathRecognitionProvider } from "@shared/ports/math-recognition";

import type { OpenedPdf } from "@modules/scan/application/pdf-document";
import type { ScanRunner } from "@modules/scan/application/scan-store";
import { isInterrupted, normalizeSettings, InvalidScanSettingsError } from "@modules/scan/domain/scan-run";

import { createTempDatabase } from "./support/temp-database";
import { seedBookWithSource } from "./support/scan-seed";

/**
 * A execução do scan (Fase 8 do prompt 03 · D49, D51, D53), com as peças de verdade: SQLite com as
 * migrações, storage em disco, pdf.js, e o PDF sintético do livro C.
 */

const sha256 = async (text: string) => createHash("sha256").update(text).digest("hex");

/** Um executor que não roda nada sozinho: o teste decide quando o laço anda. */
class ManualRunner implements ScanRunner {
  readonly queued: string[] = [];
  ensure(runId: string) {
    this.queued.push(runId);
  }
  isRunning() {
    return false;
  }
}

describe("configuração do scan", () => {
  it("normaliza e recusa intervalo invertido", () => {
    expect(normalizeSettings({})).toEqual({ pageFrom: 1, pageTo: null, useAi: false, recognizeMath: "auto" });
    expect(() => normalizeSettings({ pageFrom: 5, pageTo: 2 })).toThrow(InvalidScanSettingsError);
  });

  it("interrompida: em andamento, ninguém cuidando, batimento anterior ao processo", () => {
    const run = { state: "EXTRACTING" as const, heartbeatAt: new Date(1000), createdAt: new Date(0) };
    const now = new Date(5000);
    expect(isInterrupted(run, { runningHere: false, now, processStartedAt: new Date(2000) })).toBe(true);
    expect(isInterrupted(run, { runningHere: true, now, processStartedAt: new Date(2000) })).toBe(false);
    expect(isInterrupted({ ...run, state: "READY_FOR_REVIEW" }, { runningHere: false, now, processStartedAt: new Date(2000) })).toBe(false);
  });
});

describe("execução contra o banco", () => {
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    dispose = (await createTempDatabase()).dispose;
  });
  afterAll(async () => {
    await dispose();
  });

  async function pieces(fixture: string, slug: string) {
    const seeded = await seedBookWithSource(fixture, slug);
    const { PrismaScanStore, PrismaScanSources, storageKeyOfAsset } = await import(
      "@modules/scan/infrastructure/prisma-scan-store"
    );
    const { PdfjsDocumentReader } = await import("@modules/scan/infrastructure/pdfjs-document-reader");
    const store = new PrismaScanStore();
    const runner = new ManualRunner();
    return {
      ...seeded,
      store,
      runner,
      startDeps: { store, runner, sources: new PrismaScanSources(), sha256 },
      runDeps: { store, storage: seeded.storage, opener: new PdfjsDocumentReader(), sourceKey: storageKeyOfAsset },
    };
  }

  it("lê, grava as páginas, monta a proposta, e o livro lembra o perfil", async () => {
    const { startScan } = await import("@modules/scan/application/start-scan");
    const { runScan } = await import("@modules/scan/application/run-scan");
    const { prisma, publication, store, runner, startDeps, runDeps } = await pieces("book-c.pdf", "run-a");

    const { run, reused } = await startScan(startDeps, { publicationId: publication.id, profileId: "book-v1" });
    expect(reused).toBe(false);
    expect(runner.queued).toEqual([run.id]);
    expect(run.state).toBe("QUEUED");

    await runScan(runDeps, run.id);

    const done = await store.findRun(run.id);
    expect(done?.state).toBe("READY_FOR_REVIEW");
    expect([done?.pageFrom, done?.pageTo, done?.lastPageRead]).toEqual([1, 3, 3]);
    expect(done?.metrics?.multiPage).toBe(1);
    expect(await prisma.scanPage.count({ where: { runId: run.id } })).toBe(3);

    const items = await store.listItems(run.id);
    const exercise = items.find((item) => item.kind === "EXERCISE" && item.number === "2");
    expect(exercise?.regions.map((r) => r.pageNumber)).toEqual([2, 3]);
    // O retrato do que o scan propôs nasce igual ao item.
    expect(exercise?.proposed.regions).toEqual(exercise?.regions);

    const book = await prisma.publication.findUniqueOrThrow({ where: { id: publication.id } });
    expect(book.captureProfileId).toBe("book-v1");
    // O scan não mexe no acervo (D45).
    expect(await prisma.documentNode.count({ where: { publicationId: publication.id } })).toBe(0);
    expect(await prisma.sourceAnchor.count({ where: { publicationId: publication.id } })).toBe(0);

    // A mesma chave reabre; `forceNew` cria outra.
    const again = await startScan(startDeps, { publicationId: publication.id, profileId: "book-v1" });
    expect([again.reused, again.run.id]).toEqual([true, run.id]);
    const fresh = await startScan(startDeps, { publicationId: publication.id, profileId: "book-v1", forceNew: true });
    expect(fresh.reused).toBe(false);
    expect(fresh.run.runKey).toBe(run.runKey);
    // Outro intervalo é outra chave.
    const partial = await startScan(startDeps, { publicationId: publication.id, profileId: "book-v1", pageTo: 2 });
    expect(partial.run.runKey).not.toBe(run.runKey);
  });

  it("cancelar para no ponto de parada, e retomar continua dali", async () => {
    const { startScan } = await import("@modules/scan/application/start-scan");
    const { runScan } = await import("@modules/scan/application/run-scan");
    const { cancelScan, resumeScan } = await import("@modules/scan/application/control-scan");
    const { publication, store, runner, startDeps, runDeps } = await pieces("livro-sintetico.pdf", "run-b");

    const { run } = await startScan(startDeps, { publicationId: publication.id, profileId: "book-v1" });

    // O leitor pede o cancelamento depois da terceira página, como alguém clicando no meio.
    let read = 0;
    const cancelling = {
      open: async (bytes: Uint8Array) => {
        const pdf = await runDeps.opener.open(bytes);
        const wrapped: OpenedPdf = {
          ...pdf,
          readPage: async (page) => {
            read++;
            if (read === 3) await cancelScan({ store, runner }, run.id);
            return pdf.readPage(page);
          },
        };
        return wrapped;
      },
    };

    await runScan({ ...runDeps, opener: cancelling }, run.id);
    const stopped = await store.findRun(run.id);
    expect(stopped?.state).toBe("CANCELLED");
    expect(stopped?.lastPageRead).toBe(3);
    expect(await store.listItems(run.id)).toHaveLength(0);

    await resumeScan({ store, runner }, run.id);
    expect((await store.findRun(run.id))?.state).toBe("QUEUED");

    let reread = 0;
    const counting = {
      open: async (bytes: Uint8Array) => {
        const pdf = await runDeps.opener.open(bytes);
        return { ...pdf, readPage: (page: number) => ((reread = Math.max(reread, 0) + 1), pdf.readPage(page)) } satisfies OpenedPdf;
      },
    };
    await runScan({ ...runDeps, opener: counting }, run.id);

    const done = await store.findRun(run.id);
    expect(done?.state).toBe("READY_FOR_REVIEW");
    // Só as páginas que faltavam foram lidas de novo.
    expect(reread).toBe(9 - 3);
    expect((await store.listItems(run.id)).filter((item) => item.kind === "CHAPTER")).toHaveLength(2);
  });

  it("falhar grava o motivo e não perde as páginas lidas", async () => {
    const { startScan } = await import("@modules/scan/application/start-scan");
    const { runScan } = await import("@modules/scan/application/run-scan");
    const { prisma, publication, store, startDeps, runDeps } = await pieces("book-b.pdf", "run-c");

    const { run } = await startScan(startDeps, { publicationId: publication.id, profileId: "book-v1" });
    const failing = {
      open: async (bytes: Uint8Array) => {
        const pdf = await runDeps.opener.open(bytes);
        return {
          ...pdf,
          readPage: async (page: number) => {
            if (page === 3) throw new Error("disco sumiu");
            return pdf.readPage(page);
          },
        } satisfies OpenedPdf;
      },
    };

    await runScan({ ...runDeps, opener: failing }, run.id);
    const failed = await store.findRun(run.id);
    expect([failed?.state, failed?.error, failed?.lastPageRead]).toEqual(["FAILED", "disco sumiu", 2]);
    expect(await prisma.scanPage.count({ where: { runId: run.id } })).toBe(2);
  });

  it("IA e matemática entram só na proposta, e registram provedor e modelo", async () => {
    const { startScan } = await import("@modules/scan/application/start-scan");
    const { runScan } = await import("@modules/scan/application/run-scan");
    const { createSemanticPass } = await import("@modules/scan/application/semantic-review");
    const { createMathPass } = await import("@modules/scan/application/math-recognition");
    const { prisma, publication, store, startDeps, runDeps } = await pieces("formulas.pdf", "run-d");

    const prompts: string[] = [];
    const ai: AiProvider = {
      id: "ollama",
      listModels: async () => [],
      run: async (request) => {
        const content = request.messages[0];
        prompts.push(content && "content" in content ? content.content : "");
        // Um candidato válido, um tipo proibido e uma chave inventada: só o primeiro passa.
        const key = /"key":"(CONTENT[^"]+)"/.exec(prompts.at(-1) ?? "")?.[1] ?? "";
        return {
          text: "```json\n" + JSON.stringify({
            decisions: [
              { key, kind: "EXAMPLE", confidence: 0.8, reason: "resolve um caso concreto" },
              { key, kind: "PART", confidence: 0.9, reason: "tipo que o pai não aceita" },
              { key: "inventada", kind: "NOTE", confidence: 0.9, reason: "" },
            ],
          }) + "\n```",
          toolCalls: [],
        };
      },
    };

    let recognized = 0;
    const recognizer: MathRecognitionProvider = {
      id: "fake-vision",
      recognize: async (request) => {
        recognized++;
        expect([...request.image.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
        if (recognized === 2) throw new MathRecognitionError("modelo fora do ar", "fake-vision");
        return { latex: `\\det A = -2`, confidence: 0.9, alternatives: [], providerId: "fake-vision", model: "qwen-vl", durationMs: 12 };
      },
    };

    const { run } = await startScan(startDeps, {
      publicationId: publication.id,
      profileId: "book-v1",
      useAi: true,
      recognizeMath: "auto",
    });

    // O conteúdo da fixture é seguro demais para ser duvidoso; baixa a régua só neste teste.
    const semantic = createSemanticPass(ai, "llama3.1:8b");
    const lowering = {
      ...semantic,
      run: async (input: Parameters<typeof semantic.run>[0]) =>
        semantic.run({ ...input, items: input.items.map((item) => (item.kind === "CONTENT" ? { ...item, confidence: 0.5 } : item)) }),
    };

    await runScan({ ...runDeps, semantic: lowering, math: createMathPass(recognizer, "qwen-vl") }, run.id);

    const done = await store.findRun(run.id);
    expect(done?.state).toBe("READY_FOR_REVIEW");
    expect([done?.aiProviderId, done?.aiModel, done?.mathProviderId, done?.mathModel]).toEqual([
      "ollama",
      "llama3.1:8b",
      "fake-vision",
      "qwen-vl",
    ]);
    expect(done?.aiCalls).toBe(1);
    expect(done?.mathCalls).toBe(2);
    expect(done?.warnings.some((w) => w.includes("modelo fora do ar"))).toBe(true);
    // O prompt leva só os candidatos e a estrutura, nunca o livro.
    expect(prompts[0]).toContain('"allowed_kinds"');
    expect(prompts[0]!.length).toBeLessThan(4000);

    const items = await store.listItems(run.id);
    const reclassified = items.find((item) => item.aiDecision !== null);
    expect(reclassified?.kind).toBe("EXAMPLE");
    expect(reclassified?.aiDecision?.previousKind).toBe("CONTENT");
    expect(reclassified?.reviewState).toBe("NEEDS_REVIEW");
    // O retrato continua dizendo o que o scan determinístico propôs.
    expect(reclassified?.proposed.kind).toBe("CONTENT");

    const withMath = items.filter((item) => item.mathResult !== null);
    expect(withMath).toHaveLength(1);
    expect(withMath[0]?.mathResult).toMatchObject({ latex: "\\det A = -2", providerId: "fake-vision", model: "qwen-vl" });

    // Nada disso tocou o acervo.
    expect(await prisma.documentNode.count({ where: { publicationId: publication.id } })).toBe(0);
  });
});

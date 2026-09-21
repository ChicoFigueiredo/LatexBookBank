import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { ScanRunner } from "@modules/scan/application/scan-store";

import { createTempDatabase } from "./support/temp-database";
import { seedBookWithSource } from "./support/scan-seed";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * O perfil que saiu do registro ([ADR 0008](../../../docs/adr/0008-perfil-que-sai-do-registro.md)).
 *
 * Perfil de captura é código, e código sai — renomeado, quase sempre. O que existia antes eram
 * cinco caminhos com três comportamentos: retomar destruía a execução marcando `FAILED`, revisar e
 * aprovar devolviam 409, o passe de IA devolvia silêncio, e a tela abria normal com os seletores
 * vazios. O que se afirma aqui é a política única: **congela, avisa, e não destrói**.
 */

const sha256 = async (text: string) => createHash("sha256").update(text).digest("hex");
const idle: ScanRunner = { ensure: () => undefined, isRunning: () => false };

/** O id que nenhum perfil tem: é assim que se simula um perfil que saiu do código. */
const SUMIDO = "book-que-saiu-v1";

describe("perfil que saiu do registro", () => {
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    dispose = (await createTempDatabase()).dispose;
  });
  afterAll(async () => {
    await dispose();
  });

  async function pieces(slug: string) {
    const seeded = await seedBookWithSource("book-a.pdf", slug);
    const { PrismaScanStore, PrismaScanSources, storageKeyOfAsset } = await import(
      "@modules/scan/infrastructure/prisma-scan-store"
    );
    const { PdfjsDocumentReader } = await import("@modules/scan/infrastructure/pdfjs-document-reader");
    const { PrismaScanApproval } = await import("@modules/scan/infrastructure/prisma-scan-approval");
    const store = new PrismaScanStore();
    return {
      ...seeded,
      store,
      writer: new PrismaScanApproval(),
      startDeps: { store, runner: idle, sources: new PrismaScanSources(), sha256 },
      runDeps: { store, storage: seeded.storage, opener: new PdfjsDocumentReader(), sourceKey: storageKeyOfAsset },
    };
  }

  /** Faz o perfil "sumir" desta execução, como se alguém o tivesse tirado do código. */
  async function apagaOPerfil(prisma: { scanRun: { update: (args: unknown) => Promise<unknown> } }, runId: string) {
    await prisma.scanRun.update({ where: { id: runId }, data: { profileId: SUMIDO } });
  }

  it("retomar não destrói a execução: ela fica à espera do perfil", async () => {
    const { startScan } = await import("@modules/scan/application/start-scan");
    const { runScan } = await import("@modules/scan/application/run-scan");
    const { prisma, publication, store, startDeps, runDeps } = await pieces("sumido-a");

    const { run } = await startScan(startDeps, { publicationId: publication.id, profileId: "book-v1", recognizeMath: "never" });
    await apagaOPerfil(prisma, run.id);
    await runScan(runDeps, run.id);

    const parada = await store.findRun(run.id);
    // `FAILED` era o desfecho antigo, e o pior: `startScan` recusa reabrir execução que falhou,
    // então pedir de novo jogaria fora as páginas já lidas.
    expect(parada?.state).toBe("AWAITING_PROFILE");
    expect(parada?.state).not.toBe("FAILED");
    expect(parada?.error).toContain(SUMIDO);

    // E a chave continua valendo: devolvido o perfil, pedir de novo reabre esta mesma execução.
    await prisma.scanRun.update({ where: { id: run.id }, data: { profileId: "book-v1" } });
    const outra = await startScan(startDeps, { publicationId: publication.id, profileId: "book-v1", recognizeMath: "never" });
    expect([outra.reused, outra.run.id]).toEqual([true, run.id]);
  });

  it("a proposta congelada continua aprovável, pelo retrato do perfil", async () => {
    const { startScan } = await import("@modules/scan/application/start-scan");
    const { runScan } = await import("@modules/scan/application/run-scan");
    const { approveScan } = await import("@modules/scan/application/approve-scan");
    const { prisma, publication, store, writer, startDeps, runDeps } = await pieces("sumido-b");

    const { run } = await startScan(startDeps, { publicationId: publication.id, profileId: "book-v1", recognizeMath: "never" });
    await runScan(runDeps, run.id);
    expect((await store.findRun(run.id))?.state).toBe("READY_FOR_REVIEW");

    // O retrato foi guardado no dia da varredura, e é ele que sustenta a aprovação.
    expect((await store.findRun(run.id))?.profileSnapshot?.defaultQuestionType).toBeTruthy();
    await apagaOPerfil(prisma, run.id);

    const { summary } = await approveScan({ store, writer }, { runId: run.id, destinationId: null, includeSuggested: true });
    expect(summary.createdNodes).toBeGreaterThan(0);
    expect(await prisma.documentNode.count({ where: { publicationId: publication.id } })).toBe(summary.createdNodes);
  });

  it("o desempate por IA avisa em vez de calar", async () => {
    const { createSemanticPass } = await import("@modules/scan/application/semantic-review");
    const provider = {
      id: "dublê",
      listModels: async () => [],
      run: async () => {
        throw new Error("a IA não devia ser chamada sem perfil");
      },
    };

    const passada = createSemanticPass(provider, "modelo-qualquer");
    const resultado = await passada.run({
      run: { profileId: SUMIDO } as never,
      items: [],
      cancelled: async () => false,
    });

    /*
      O silêncio era indistinguível de sucesso: `{ changed: [], calls: 0 }` é exatamente o que uma
      passada que rodou e não achou nada devolve. A execução terminava dizendo que a IA trabalhou.
    */
    expect(resultado.calls).toBe(0);
    expect(resultado.warnings?.join(" ")).toContain(SUMIDO);
  });

  it("mas editar a proposta congelada não dá — e o erro diz por quê", async () => {
    const { startScan } = await import("@modules/scan/application/start-scan");
    const { runScan } = await import("@modules/scan/application/run-scan");
    const { reviewScan } = await import("@modules/scan/application/review-scan");
    const { prisma, publication, store, startDeps, runDeps } = await pieces("sumido-c");

    const { run } = await startScan(startDeps, { publicationId: publication.id, profileId: "book-v1", recognizeMath: "never" });
    await runScan(runDeps, run.id);
    const alvo = (await store.listItems(run.id))[0]!;
    await apagaOPerfil(prisma, run.id);

    // `canContain` é código, não dado: nenhum retrato o substitui, e a mensagem admite isso.
    await expect(
      reviewScan({ store, newId: () => "novo" }, run.id, { type: "accept", itemIds: [alvo.id] }),
    ).rejects.toThrow(/congelada/);
  });
});

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import type * as RevisionReader from "@modules/revisions/infrastructure/prisma-revision-reader";
import type { PrismaPatchApplier } from "@infrastructure/agent/prisma-patch-applier";
import { applyQuestionPatch } from "@modules/agents/application/apply-question-patch";
import { PATCH_SCHEMA_VERSION, parseQuestionPatch } from "@modules/agents/domain/question-patch";

import { createTempDatabase } from "./support/temp-database";

// Monta um SQLite com as migrações: sozinho leva um ou dois segundos, e com a suíte inteira em
// paralelo passa dos 5 s padrão.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * O leitor de revisões (`prisma-revision-reader`) contra um SQLite com as migrações reais (TST-05
 * da revisão de 2026-09-23).
 *
 * É ele que entrega ao "reverter" o snapshot a restaurar, e a regra que importa é de onde o
 * snapshot vem: do banco, da revisão **desta** questão. Uma leitura que achasse a revisão pelo
 * número sem o dono, ou que confundisse a revisão de um nó com a da questão, restauraria o estado
 * de outra entidade. As revisões nascem pelo caso de uso, como no produto.
 */

let dispose: () => Promise<void>;
let prisma: PrismaClient;
let applier: PrismaPatchApplier;
let reader: typeof RevisionReader;

beforeAll(async () => {
  const db = await createTempDatabase();
  dispose = db.dispose;

  // Depois do banco: o cliente Prisma lê `DATABASE_URL` ao ser importado.
  ({ prisma } = await import("@infrastructure/database/sqlite/client"));
  const { PrismaPatchApplier } = await import("@infrastructure/agent/prisma-patch-applier");
  applier = new PrismaPatchApplier();
  reader = await import("@modules/revisions/infrastructure/prisma-revision-reader");
});

afterAll(async () => {
  await dispose();
});

async function questao(statementLatex: string) {
  return prisma.question.create({
    data: { type: "DISCURSIVE", statementLatex },
    select: { id: true },
  });
}

/** Troca o enunciado pelo caso de uso — a revisão do estado anterior vem junto. */
async function reescrever(questionId: string, statementLatex: string, summary: string) {
  const patch = parseQuestionPatch({
    schemaVersion: PATCH_SCHEMA_VERSION,
    summary,
    fields: [{ field: "statementLatex", value: statementLatex }],
  });
  const { readQuestionState } = await import("@infrastructure/agent/prisma-question-state");
  const { diffPatch } = await import("@modules/agents/domain/patch-diff");
  const state = await readQuestionState(questionId);
  if (state === null) throw new Error("questão sumiu");
  return applyQuestionPatch(applier, {
    questionId,
    patch,
    approvedChangeIds: diffPatch(state, patch).map((change) => change.id),
  });
}

describe("as revisões de uma questão", () => {
  it("a lista vem da mais recente para a mais antiga, sem o snapshot, e respeita o limite", async () => {
    const { id } = await questao("v0");
    await reescrever(id, "v1", "Primeira.");
    await reescrever(id, "v2", "Segunda.");
    await reescrever(id, "v3", "Terceira.");

    const todas = await reader.listRevisions("QUESTION", id);
    expect(todas.map((r) => [r.revisionNumber, r.origin, r.summary.split(" (")[0]])).toEqual([
      [3, "AGENT", "Terceira."],
      [2, "AGENT", "Segunda."],
      [1, "AGENT", "Primeira."],
    ]);
    // A lista é o que a aba Histórico carrega: o snapshot só vem quando alguém abre uma.
    expect(todas.every((r) => !("snapshotJson" in r))).toBe(true);
    expect(todas.every((r) => r.createdAt instanceof Date)).toBe(true);

    expect((await reader.listRevisions("QUESTION", id, 2)).map((r) => r.revisionNumber)).toEqual([
      3, 2,
    ]);
  });

  it("a revisão aberta traz o estado de antes daquela mudança", async () => {
    const { id } = await questao("original");
    await reescrever(id, "reescrito", "Reescreve.");
    await reescrever(id, "de novo", "De novo.");

    const primeira = await reader.findRevision("QUESTION", id, 1);
    const segunda = await reader.findRevision("QUESTION", id, 2);

    expect(JSON.parse(primeira?.snapshotJson ?? "{}")).toMatchObject({
      statementLatex: "original",
    });
    expect(JSON.parse(segunda?.snapshotJson ?? "{}")).toMatchObject({
      statementLatex: "reescrito",
    });
    expect(await reader.findRevision("QUESTION", id, 3)).toBeNull();
  });

  it("a revisão é da questão: nem a de outra questão, nem a de um nó com o mesmo id", async () => {
    const minha = await questao("minha");
    const outra = await questao("outra");
    await reescrever(outra.id, "outra reescrita", "Na outra.");
    // Uma revisão de outro tipo de entidade com o mesmo id e número — o índice único deixa.
    await prisma.revision.create({
      data: {
        entityType: "DOCUMENT_NODE",
        entityId: minha.id,
        revisionNumber: 1,
        origin: "USER",
        summary: "Do nó.",
        snapshotJson: JSON.stringify({ bodyLatex: "corpo" }),
      },
    });

    expect(await reader.findRevision("QUESTION", minha.id, 1)).toBeNull();
    expect(await reader.listRevisions("QUESTION", minha.id)).toEqual([]);
    expect((await reader.listRevisions("QUESTION", outra.id)).map((r) => r.revisionNumber)).toEqual(
      [1],
    );
  });
});

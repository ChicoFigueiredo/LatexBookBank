import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { seedLibrary } from "./support/assessment-seed";
import { installRouteFetch, type RouteEntry } from "./support/route-fetch";
import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * O cliente da questão contra as rotas de verdade (tarefa I8 · ARQ-10 da revisão de 2026-09-23).
 *
 * O editor da questão lia cinco respostas com a forma escrita à mão. Aqui o `questionApi` faz o
 * que o editor faz — ler os metadados, gravar com a versão, levar 409 e 400, abrir o histórico —
 * contra os Route Handlers e um SQLite temporário.
 */

const ROUTES: readonly RouteEntry[] = [
  [
    "GET",
    "/api/publications/:id/questions/:questionId",
    () => import("../app/api/publications/[id]/questions/[questionId]/route"),
  ],
  [
    "PATCH",
    "/api/publications/:id/questions/:questionId",
    () => import("../app/api/publications/[id]/questions/[questionId]/route"),
  ],
  [
    "GET",
    "/api/questions/:questionId/revisions",
    () => import("../app/api/questions/[questionId]/revisions/route"),
  ],
  ["POST", "/api/agents/patches/apply", () => import("../app/api/agents/patches/apply/route")],
  ["POST", "/api/agents/patches/revert", () => import("../app/api/agents/patches/revert/route")],
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

async function cenario(slug: string) {
  const library = await seedLibrary(slug);
  const { questionId } = await library.question({
    type: "DISCURSIVE",
    statement: "Enunciado original.",
  });
  restore = installRouteFetch(ROUTES).restore;
  const { questionApi } = await import("@modules/questions/ui/question-client");
  return { library, questionId, publicationId: library.publication.id, questionApi };
}

describe("o cliente da questão fala a língua das rotas", () => {
  it("lê os metadados e grava com a versão que a rota devolve", async () => {
    const { library, questionId, publicationId, questionApi } = await cenario("q-contrato-1");

    const metadata = await questionApi.metadata(publicationId, questionId);
    expect(metadata).toMatchObject({ difficulty: 5, year: null, board: null });

    const antes = await library.prisma.question.findUniqueOrThrow({ where: { id: questionId } });
    const primeira = await questionApi.save(publicationId, questionId, {
      expectedVersion: antes.updatedAt.toISOString(),
      statementLatex: "Enunciado novo.",
      solutionLatex: "",
      complementLatex: "",
      ...metadata!,
      board: "CEBRASPE",
    });

    expect(primeira.kind).toBe("saved");
    const version = primeira.kind === "saved" ? primeira.version : null;
    expect(version).toEqual(expect.any(String));

    // A versão devolvida é a que vale para a próxima gravação.
    const segunda = await questionApi.save(publicationId, questionId, {
      expectedVersion: version!,
      statementLatex: "Enunciado novo de novo.",
    });
    expect(segunda.kind).toBe("saved");

    const gravada = await library.prisma.question.findUniqueOrThrow({ where: { id: questionId } });
    expect(gravada.statementLatex).toBe("Enunciado novo de novo.");
    expect(gravada.board).toBe("CEBRASPE");
  });

  it("versão velha é conflito, com a mensagem da rota", async () => {
    const { questionId, publicationId, questionApi } = await cenario("q-contrato-2");

    const outcome = await questionApi.save(publicationId, questionId, {
      expectedVersion: new Date(0).toISOString(),
      statementLatex: "x",
    });

    expect(outcome.kind).toBe("conflict");
    expect(outcome.kind === "conflict" ? outcome.message : null).toMatch(/mudou/);
  });

  it("metadado inválido é recusa com status e mensagem", async () => {
    const { library, questionId, publicationId, questionApi } = await cenario("q-contrato-3");
    const atual = await library.prisma.question.findUniqueOrThrow({ where: { id: questionId } });

    const outcome = await questionApi.save(publicationId, questionId, {
      expectedVersion: atual.updatedAt.toISOString(),
      year: 20244,
    });

    expect(outcome).toMatchObject({ kind: "failed", status: 400 });
    expect(outcome.kind === "failed" ? outcome.message : null).toEqual(expect.any(String));
  });

  it("questão de outra publicação não tem metadados para esta", async () => {
    const { questionId, questionApi } = await cenario("q-contrato-4");
    expect(await questionApi.metadata("outra-publicacao", questionId)).toBeNull();
  });

  it("Conferido e trocar o tipo gravam com a versão, e a recusa volta lida, sem lançar", async () => {
    const { library, questionId, publicationId, questionApi } = await cenario("q-contrato-6");
    const versao = async () =>
      (
        await library.prisma.question.findUniqueOrThrow({ where: { id: questionId } })
      ).updatedAt.toISOString();

    const conferida = await questionApi.confirm(publicationId, questionId, await versao());
    expect(conferida.ok).toBe(true);
    expect(conferida.body.version).toEqual(expect.any(String));

    const trocada = await questionApi.changeType(
      publicationId,
      questionId,
      await versao(),
      "TRUE_FALSE",
    );
    expect(trocada.ok).toBe(true);

    const gravada = await library.prisma.question.findUniqueOrThrow({ where: { id: questionId } });
    expect(gravada.status).toBe("READY");
    expect(gravada.type).toBe("TRUE_FALSE");

    // Versão velha: a tela recarrega do mesmo jeito, então a recusa não pode virar exceção.
    const velha = await questionApi.confirm(publicationId, questionId, new Date(0).toISOString());
    expect(velha.ok).toBe(false);
    expect(velha.status).toBe(409);
  });

  it("gravação com resposta que não é JSON diz o status, e não derruba o autosave", async () => {
    const { questionApi } = await import("@modules/questions/ui/question-client");
    restore = installRouteFetch(
      [],
      () => new Response("<html>502 Bad Gateway</html>", { status: 502 }),
    ).restore;

    const outcome = await questionApi.save("p", "q", { expectedVersion: "v" });

    expect(outcome).toEqual({ kind: "failed", status: 502, message: null });
  });

  it("o histórico lista as revisões e devolve os dois lados do diff", async () => {
    const { questionId, questionApi } = await cenario("q-contrato-5");
    const { agentApi } = await import("@modules/agents/ui/agent-client");
    const { readQuestionState } = await import("@infrastructure/agent/prisma-question-state");
    const { diffPatch } = await import("@modules/agents/domain/patch-diff");

    expect(await questionApi.revisions(questionId)).toEqual([]);

    const patch = {
      schemaVersion: 1 as const,
      summary: "Escreve o complemento",
      warnings: [],
      fields: [{ field: "complementLatex" as const, value: "complemento" }],
      options: [],
    };
    const changes = diffPatch((await readQuestionState(questionId))!, patch);
    const applied = await agentApi.applyPatch({
      questionId,
      approvedChangeIds: changes.map((change) => change.id),
      patch,
    });

    const revisions = await questionApi.revisions(questionId);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ revisionNumber: applied.revisionNumber, origin: "AGENT" });
    expect(Number.isNaN(Date.parse(revisions[0]!.createdAt))).toBe(false);

    const sides = await questionApi.revision(questionId, applied.revisionNumber);
    expect(sides?.snapshot.complementLatex).toBe("");
    expect(sides?.current.complementLatex).toBe("complemento");

    expect(await questionApi.revision(questionId, 999)).toBeNull();
  });
});

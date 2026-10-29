import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
// Só o tipo: o valor vem por `import()` depois do banco, porque o cliente Prisma lê
// `DATABASE_URL` ao ser importado.
import type { PrismaPatchApplier } from "@infrastructure/agent/prisma-patch-applier";
import {
  applyQuestionPatch,
  revertQuestion,
} from "@modules/agents/application/apply-question-patch";
import { PATCH_SCHEMA_VERSION, parseQuestionPatch } from "@modules/agents/domain/question-patch";

import { createTempDatabase } from "./support/temp-database";

// Monta um SQLite com as migrações: sozinho leva um ou dois segundos, e com a suíte inteira em
// paralelo passa dos 5 s padrão.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * A única escrita do fluxo agêntico, contra o `PrismaPatchApplier` e um SQLite com as migrações
 * reais (TST-05 da revisão de 2026-09-23).
 *
 * `apply-patch.test.ts` prova o plano e o caso de uso com um dublê. O que só o banco prova: a
 * revisão gravada antes da escrita **na mesma transação**, a numeração das revisões, a correta que
 * desmarca as outras, a reordenação por chave nova, as tags criadas no workspace da questão — e o
 * reverter que devolve tudo isso.
 */

let dispose: () => Promise<void>;
let prisma: PrismaClient;
let applier: PrismaPatchApplier;

beforeAll(async () => {
  const db = await createTempDatabase();
  dispose = db.dispose;

  ({ prisma } = await import("@infrastructure/database/sqlite/client"));
  const { PrismaPatchApplier } = await import("@infrastructure/agent/prisma-patch-applier");
  applier = new PrismaPatchApplier();
});

afterAll(async () => {
  await dispose();
});

let sequence = 0;

/** Uma múltipla escolha dentro de um livro: a tag precisa do workspace, que vem pelo nó. */
async function questaoNoLivro() {
  sequence += 1;
  const workspace = await prisma.workspace.create({
    data: { name: `Agente ${sequence}`, slug: `agente-${sequence}` },
  });
  const publication = await prisma.publication.create({
    data: { workspaceId: workspace.id, title: "Livro" },
  });
  const juros = await prisma.tag.create({ data: { workspaceId: workspace.id, name: "juros" } });
  const question = await prisma.question.create({
    data: {
      type: "MULTIPLE_CHOICE",
      statementLatex: "Qual é a taxa?",
      board: "CESPE",
      options: {
        create: [
          { sortKey: "a0", statementLatex: "1\\%", isCorrect: true },
          { sortKey: "a1", statementLatex: "2\\%", isCorrect: false },
          { sortKey: "a2", statementLatex: "3\\%", isCorrect: false },
        ],
      },
      tags: { create: [{ tagId: juros.id }] },
    },
    include: { options: { orderBy: { sortKey: "asc" } } },
  });
  await prisma.documentNode.create({
    data: {
      publicationId: publication.id,
      kind: "QUESTION",
      sortKey: "a0",
      questionId: question.id,
    },
  });
  const [um, dois, tres] = question.options.map((option) => option.id) as [string, string, string];
  return { workspace, question, um, dois, tres };
}

const patch = (over: Record<string, unknown>) =>
  parseQuestionPatch({ schemaVersion: PATCH_SCHEMA_VERSION, summary: "Corrige.", ...over });

async function estado(questionId: string) {
  const row = await prisma.question.findUniqueOrThrow({
    where: { id: questionId },
    include: {
      options: { orderBy: { sortKey: "asc" } },
      tags: { include: { tag: true } },
    },
  });
  return {
    statementLatex: row.statementLatex,
    board: row.board,
    options: row.options.map((o) => [o.statementLatex, o.isCorrect]),
    tags: row.tags.map((t) => t.tag.name).sort(),
  };
}

/**
 * Os ids das linhas que a tela mostraria, filtrados pelo começo: o id leva a impressão do valor
 * anterior (F3, #266), então o teste aprova como a tela aprova — calculando o diff do estado lido.
 */
async function aprovadas(
  questionId: string,
  proposta: ReturnType<typeof patch>,
  prefixos: readonly string[],
): Promise<string[]> {
  const { readQuestionState } = await import("@infrastructure/agent/prisma-question-state");
  const { diffPatch } = await import("@modules/agents/domain/patch-diff");
  const state = await readQuestionState(questionId);
  if (state === null) throw new Error("questão sumiu");
  return diffPatch(state, proposta)
    .map((change) => change.id)
    .filter((id) => prefixos.some((prefixo) => id === prefixo || id.startsWith(`${prefixo}:`)));
}

describe("aplicar o patch aprovado", () => {
  it("grava só as linhas aprovadas, e a revisão do estado anterior vem junto", async () => {
    const { question } = await questaoNoLivro();

    const proposta = patch({
      fields: [{ field: "statementLatex", value: "Qual é a taxa à vista?" }],
      metadata: { board: "CEBRASPE" },
    });
    const result = await applyQuestionPatch(applier, {
      questionId: question.id,
      patch: proposta,
      approvedChangeIds: await aprovadas(question.id, proposta, ["field:statementLatex"]),
    });

    expect(result.revisionNumber).toBe(1);
    expect(await estado(question.id)).toMatchObject({
      statementLatex: "Qual é a taxa à vista?",
      // Não aprovada: fica como estava.
      board: "CESPE",
    });

    const [revisao] = await prisma.revision.findMany({
      where: { entityType: "QUESTION", entityId: question.id },
    });
    expect(revisao).toMatchObject({ revisionNumber: 1, origin: "AGENT" });
    expect(JSON.parse(revisao!.snapshotJson)).toMatchObject({ statementLatex: "Qual é a taxa?" });
  });

  it("marcar outra correta desmarca a anterior, reordenar dá chave nova, e as tags são o conjunto", async () => {
    const { workspace, question, um, dois, tres } = await questaoNoLivro();

    const proposta = patch({
      options: [{ optionId: dois, isCorrect: true }],
      reorder: { optionIds: [tres, dois, um] },
      tags: { names: ["porcentagem"] },
    });

    await applyQuestionPatch(applier, {
      questionId: question.id,
      patch: proposta,
      approvedChangeIds: await aprovadas(question.id, proposta, [
        `option:${dois}:correct`,
        "reorder",
        "tags",
      ]),
    });

    expect(await estado(question.id)).toMatchObject({
      options: [
        ["3\\%", false],
        ["2\\%", true],
        ["1\\%", false],
      ],
      // O patch traz o conjunto completo: "juros" sai, "porcentagem" nasce no workspace.
      tags: ["porcentagem"],
    });
    expect(
      await prisma.tag.findFirst({ where: { workspaceId: workspace.id, name: "porcentagem" } }),
    ).not.toBeNull();
  });

  it("um id de alternativa de outra questão não grava nada fora desta", async () => {
    // O plano já descarta o id que não está no estado da questão; isto é a segunda barreira, no
    // adaptador: o id veio de um patch, e a lista é recusada antes de qualquer escrita.
    const { question } = await questaoNoLivro();
    const outra = await questaoNoLivro();
    const { AlternativaDeOutraQuestaoError } =
      await import("@modules/agents/application/apply-question-patch");

    await expect(
      applier.transact((tx) =>
        tx.applyOptions(question.id, [
          { id: outra.dois, statementLatex: "invadido", isCorrect: true },
        ]),
      ),
    ).rejects.toThrow(AlternativaDeOutraQuestaoError);

    expect((await estado(outra.question.id)).options).toEqual([
      ["1\\%", true],
      ["2\\%", false],
      ["3\\%", false],
    ]);
  });

  it("um gabarito que aponta para alternativa de outra questão é recusado, e a questão fica com a correta", async () => {
    // O gabarito de uma múltipla escolha chega inteiro: a nova correta e a antiga desmarcada. Se
    // a nova é de outra questão, ignorá-la e gravar o resto deixava esta sem correta nenhuma —
    // por isso o adaptador recusa a lista toda, e a transação leva a revisão junto.
    const { question, um } = await questaoNoLivro();
    const outra = await questaoNoLivro();
    const { AlternativaDeOutraQuestaoError } =
      await import("@modules/agents/application/apply-question-patch");

    await expect(
      applier.transact(async (tx) => {
        await tx.writeRevision({
          questionId: question.id,
          origin: "AGENT",
          agentRunId: null,
          summary: "antes",
          snapshotJson: "{}",
        });
        await tx.applyOptions(question.id, [
          { id: outra.dois, isCorrect: true },
          { id: um, isCorrect: false },
        ]);
      }),
    ).rejects.toThrow(AlternativaDeOutraQuestaoError);

    expect((await estado(question.id)).options).toEqual([
      ["1\\%", true],
      ["2\\%", false],
      ["3\\%", false],
    ]);
    expect((await estado(outra.question.id)).options[1]).toEqual(["2\\%", false]);
    expect(
      await prisma.revision.count({ where: { entityType: "QUESTION", entityId: question.id } }),
    ).toBe(0);
  });

  it("reordenar com um id de outra questão é recusado, e a ordem fica como estava", async () => {
    const { question, um, dois, tres } = await questaoNoLivro();
    const outra = await questaoNoLivro();
    const { AlternativaDeOutraQuestaoError } =
      await import("@modules/agents/application/apply-question-patch");
    const chaves = async () =>
      (
        await prisma.questionOption.findMany({
          where: { questionId: question.id },
          orderBy: { id: "asc" },
          select: { id: true, sortKey: true },
        })
      ).map((option) => [option.id, option.sortKey]);
    const antes = await chaves();

    await expect(
      applier.transact((tx) => tx.applyReorder(question.id, [tres, outra.um, dois, um])),
    ).rejects.toThrow(AlternativaDeOutraQuestaoError);

    expect(await chaves()).toEqual(antes);
  });
});

describe("reverter", () => {
  it("devolve texto, alternativas, ordem, metadados e tags, e grava uma revisão antes", async () => {
    const { question, um, dois, tres } = await questaoNoLivro();
    const antes = await estado(question.id);

    const proposta = patch({
      fields: [{ field: "statementLatex", value: "Mudou." }],
      options: [{ optionId: tres, isCorrect: true }],
      reorder: { optionIds: [dois, tres, um] },
      metadata: { board: "FGV" },
      tags: { names: [] },
    });

    await applyQuestionPatch(applier, {
      questionId: question.id,
      patch: proposta,
      approvedChangeIds: await aprovadas(question.id, proposta, [
        "field:statementLatex",
        `option:${tres}:correct`,
        "reorder",
        "metadata:board",
        "tags",
      ]),
    });
    const [primeira] = await prisma.revision.findMany({
      where: { entityType: "QUESTION", entityId: question.id },
      orderBy: { revisionNumber: "asc" },
    });

    const numero = await revertQuestion(applier, {
      questionId: question.id,
      snapshotJson: primeira!.snapshotJson,
      summary: "Desfaz o agente.",
    });

    expect(numero).toBe(2);
    expect(await estado(question.id)).toEqual(antes);
  });
});

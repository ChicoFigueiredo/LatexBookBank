import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PATCH_SCHEMA_VERSION, parseQuestionPatch } from "@modules/agents/domain/question-patch";

import { createTempDatabase } from "./support/temp-database";

// Monta um SQLite com as migrações: com a suíte em paralelo passa dos 5 s padrão.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * Aplicar patch e reverter, contra o banco de verdade.
 *
 * O `PrismaPatchApplier` é a única escrita do fluxo agêntico, e até aqui só era provado com um
 * dublê que registrava o que tinha sido pedido — não o que ficou gravado. O gabarito de uma
 * MULTIPLE_CORRECT, a alternativa apagada depois da revisão e a ordem parcial só aparecem no
 * estado que sobra no banco.
 */

let dispose: () => Promise<void>;

beforeAll(async () => {
  dispose = (await createTempDatabase()).dispose;
});
afterAll(async () => {
  await dispose();
});

const modules = async () => {
  const { prisma } = await import("@infrastructure/database/sqlite/client");
  const { PrismaPatchApplier } = await import("@infrastructure/agent/prisma-patch-applier");
  const { readQuestionState } = await import("@infrastructure/agent/prisma-question-state");
  const { findRevision } = await import("@infrastructure/agent/prisma-revision-reader");
  const { PrismaOptionWriter } =
    await import("@modules/questions/infrastructure/prisma-option-writer");
  const { applyQuestionPatch, revertQuestion } =
    await import("@modules/agents/application/apply-question-patch");
  const { diffPatch } = await import("@modules/agents/domain/patch-diff");
  return {
    prisma,
    applier: new PrismaPatchApplier(),
    readQuestionState,
    findRevision,
    options: new PrismaOptionWriter(),
    applyQuestionPatch,
    revertQuestion,
    diffPatch,
  };
};

let seq = 0;

/** Uma questão numa árvore, com as alternativas na ordem dada. Devolve os ids por letra. */
async function seedQuestion(type: string, options: readonly [string, boolean][]) {
  const { prisma } = await modules();
  seq += 1;
  const workspace = await prisma.workspace.create({
    data: { name: `ws-${seq}`, slug: `ws-${seq}` },
  });
  const publication = await prisma.publication.create({
    data: { workspaceId: workspace.id, title: `Livro ${seq}` },
  });
  const question = await prisma.question.create({
    data: {
      type,
      statementLatex: "Assinale as corretas.",
      options: {
        create: options.map(([text, isCorrect], index) => ({
          sortKey: `a${index}`,
          statementLatex: text,
          isCorrect,
        })),
      },
    },
    select: { id: true, options: { orderBy: { sortKey: "asc" }, select: { id: true } } },
  });
  await prisma.documentNode.create({
    data: {
      publicationId: publication.id,
      kind: "QUESTION",
      sortKey: "a0",
      questionId: question.id,
    },
  });

  return { questionId: question.id, ids: question.options.map((option) => option.id) };
}

const patch = (over: Record<string, unknown>) =>
  parseQuestionPatch({ schemaVersion: PATCH_SCHEMA_VERSION, summary: "Ajuste.", ...over });

/** O que o banco diz agora: o texto e se é correta, na ordem das letras. */
async function answerKey(questionId: string) {
  const { readQuestionState } = await modules();
  const state = await readQuestionState(questionId);
  return state?.options.map((option) => [option.statementLatex, option.isCorrect]) ?? [];
}

/** Propõe, calcula o diff como a tela faz e aprova todas as linhas. */
async function approveAll(questionId: string, proposal: ReturnType<typeof patch>) {
  const { readQuestionState, diffPatch, applyQuestionPatch, applier } = await modules();
  const state = await readQuestionState(questionId);
  if (state === null) throw new Error("questão sumiu");
  const changes = diffPatch(state, proposal);
  const result = await applyQuestionPatch(applier, {
    questionId,
    patch: proposal,
    approvedChangeIds: changes.map((change) => change.id),
  });
  return { changes, result };
}

describe("o gabarito segue o tipo da questão", () => {
  it("MULTIPLE_CORRECT: marcar d) correta não desmarca a) e c)", async () => {
    const { questionId, ids } = await seedQuestion("MULTIPLE_CORRECT", [
      ["a", true],
      ["b", false],
      ["c", true],
      ["d", false],
    ]);

    await approveAll(questionId, patch({ options: [{ optionId: ids[3], isCorrect: true }] }));

    expect(await answerKey(questionId)).toEqual([
      ["a", true],
      ["b", false],
      ["c", true],
      ["d", true],
    ]);
  });

  it("MULTIPLE_CORRECT aceita um patch que marca duas corretas", async () => {
    const { questionId, ids } = await seedQuestion("MULTIPLE_CORRECT", [
      ["a", false],
      ["b", false],
      ["c", false],
    ]);

    await approveAll(
      questionId,
      patch({
        options: [
          { optionId: ids[0], isCorrect: true },
          { optionId: ids[2], isCorrect: true },
        ],
      }),
    );

    expect(await answerKey(questionId)).toEqual([
      ["a", true],
      ["b", false],
      ["c", true],
    ]);
  });

  it("MULTIPLE_CHOICE: a correta antiga é desmarcada, e o diff mostra isso", async () => {
    const { questionId, ids } = await seedQuestion("MULTIPLE_CHOICE", [
      ["a", false],
      ["b", true],
      ["c", false],
    ]);

    const { changes } = await approveAll(
      questionId,
      patch({ options: [{ optionId: ids[0], isCorrect: true }] }),
    );

    // Quem aprova precisa ver que b) deixa de ser a correta — não só que a) passa a ser.
    expect(changes.map((change) => `${change.before} → ${change.after}`).join(" | ")).toMatch(
      /b\)/,
    );
    expect(await answerKey(questionId)).toEqual([
      ["a", true],
      ["b", false],
      ["c", false],
    ]);
  });

  it("MULTIPLE_CHOICE recusa um patch que marca duas corretas", async () => {
    const { questionId, ids } = await seedQuestion("MULTIPLE_CHOICE", [
      ["a", false],
      ["b", true],
      ["c", false],
    ]);

    await expect(
      approveAll(
        questionId,
        patch({
          options: [
            { optionId: ids[0], isCorrect: true },
            { optionId: ids[2], isCorrect: true },
          ],
        }),
      ),
    ).rejects.toThrow(/uma correta/);
    expect(await answerKey(questionId)).toEqual([
      ["a", false],
      ["b", true],
      ["c", false],
    ]);
  });
});

describe("reverter devolve o estado exato", () => {
  it("MULTIPLE_CORRECT com a) e c) corretas volta com as duas", async () => {
    const { revertQuestion, applier, findRevision } = await modules();
    const { questionId } = await seedQuestion("MULTIPLE_CORRECT", [
      ["a", true],
      ["b", false],
      ["c", true],
    ]);

    const { result } = await approveAll(
      questionId,
      patch({ fields: [{ field: "statementLatex", value: "Enunciado novo." }] }),
    );
    const revision = await findRevision(questionId, result.revisionNumber);

    await revertQuestion(applier, {
      questionId,
      snapshotJson: revision?.snapshotJson ?? "",
      summary: "Reverte.",
    });

    expect(await answerKey(questionId)).toEqual([
      ["a", true],
      ["b", false],
      ["c", true],
    ]);
  });

  it("alternativa apagada volta, a criada depois sai, e o tipo trocado é restaurado", async () => {
    const { revertQuestion, applier, findRevision, options, prisma, readQuestionState } =
      await modules();
    const { questionId, ids } = await seedQuestion("MULTIPLE_CHOICE", [
      ["A", false],
      ["B", false],
      ["C", true],
      ["D", false],
      ["E", false],
    ]);

    const { result } = await approveAll(
      questionId,
      patch({ fields: [{ field: "statementLatex", value: "Enunciado revisado." }] }),
    );
    const revision = await findRevision(questionId, result.revisionNumber);

    // Depois da revisão, no editor: apaga C, acrescenta F, e troca o tipo para discursiva.
    await options.deleteOption(questionId, ids[2] as string);
    await options.insertOption(questionId, {
      sortKey: "a9",
      statementLatex: "F",
      solutionLatex: "",
      isCorrect: false,
    });
    await prisma.question.update({ where: { id: questionId }, data: { type: "DISCURSIVE" } });

    await revertQuestion(applier, {
      questionId,
      snapshotJson: revision?.snapshotJson ?? "",
      summary: "Reverte.",
    });

    expect(await answerKey(questionId)).toEqual([
      ["A", false],
      ["B", false],
      ["C", true],
      ["D", false],
      ["E", false],
    ]);
    const state = await readQuestionState(questionId);
    expect(state?.options.map((option) => option.id)).toEqual(ids);
    expect(state?.type).toBe("MULTIPLE_CHOICE");
  });
});

describe("a ordem das alternativas", () => {
  it("uma ordem parcial não vira mudança — e nada empata", async () => {
    const { readQuestionState, diffPatch } = await modules();
    const { questionId, ids } = await seedQuestion("MULTIPLE_CHOICE", [
      ["A", false],
      ["B", true],
      ["C", false],
      ["D", false],
      ["E", false],
    ]);
    const state = await readQuestionState(questionId);
    if (state === null) throw new Error("questão sumiu");

    const changes = diffPatch(state, patch({ reorder: { optionIds: [ids[2], ids[0]] } }));

    expect(changes).toEqual([]);
  });

  it("uma permutação completa grava chaves distintas, na ordem pedida", async () => {
    const { questionId, ids } = await seedQuestion("MULTIPLE_CHOICE", [
      ["A", false],
      ["B", true],
      ["C", false],
    ]);

    await approveAll(questionId, patch({ reorder: { optionIds: [ids[2], ids[0], ids[1]] } }));

    expect(await answerKey(questionId)).toEqual([
      ["C", false],
      ["A", false],
      ["B", true],
    ]);
  });
});

describe("a aprovação vale sobre o estado que foi mostrado", () => {
  it("uma edição feita depois da proposta torna a linha obsoleta, e nada é sobrescrito", async () => {
    const { readQuestionState, diffPatch, applyQuestionPatch, applier, prisma } = await modules();
    const { questionId } = await seedQuestion("MULTIPLE_CHOICE", [
      ["A", true],
      ["B", false],
    ]);

    const proposal = patch({ fields: [{ field: "statementLatex", value: "Versão do agente." }] });
    const shown = await readQuestionState(questionId);
    if (shown === null) throw new Error("questão sumiu");
    const approved = diffPatch(shown, proposal).map((change) => change.id);

    // Com o painel de revisão aberto, o autosave grava a vírgula corrigida.
    await prisma.question.update({
      where: { id: questionId },
      data: { statementLatex: "Assinale, as corretas." },
    });

    await expect(
      applyQuestionPatch(applier, { questionId, patch: proposal, approvedChangeIds: approved }),
    ).rejects.toThrow(/Nenhuma mudança/);
    expect((await readQuestionState(questionId))?.statementLatex).toBe("Assinale, as corretas.");
  });
});

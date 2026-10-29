import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { ScanImportStore } from "@modules/scan/application/remove-import";
import type { ScanRun, ScanStore } from "@modules/scan/application/scan-store";
import type { QuestionValidation } from "@modules/questions/application/validate-question";

import { seedBookWithSource } from "./support/scan-seed";
import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * Apagar a importação tira o trecho que ela pôs no enunciado de uma questão que ela não criou
 * (#249, CAP-09, achado B5 da revisão de código).
 *
 * O corpo do nó já saía com revisão; o enunciado da questão era regravado sem histórico e sem
 * revalidar — o texto anterior sumia, e o selo da árvore ficava com o veredito do texto velho.
 */

let dispose: () => Promise<void>;
beforeAll(async () => {
  dispose = (await createTempDatabase()).dispose;
});
afterAll(async () => {
  await dispose();
});

const FIGURA = "\\begin{center}\\includegraphics{figura-do-scan}\\end{center}";

/** Uma questão de outra origem, com a figura que a importação lhe acrescentou no fim do enunciado. */
async function questaoComFigura(slug: string) {
  const { prisma, publication } = await seedBookWithSource("book-c.pdf", slug);
  const question = await prisma.question.create({
    data: {
      type: "MULTIPLE_CHOICE",
      statementLatex: `Quanto é $1+1$?\n\n${FIGURA}`,
      validationStatus: "UNVALIDATED",
      options: {
        create: [
          { sortKey: "a0", statementLatex: "1" },
          { sortKey: "a1", statementLatex: "2", isCorrect: true },
        ],
      },
    },
  });
  const node = await prisma.documentNode.create({
    data: {
      publicationId: publication.id,
      kind: "QUESTION",
      sortKey: "a0",
      questionId: question.id,
    },
  });
  return { prisma, question, node };
}

describe("o enunciado que a importação acrescentou sai com ela", () => {
  it("grava a revisão com o enunciado anterior e diz qual questão mudou", async () => {
    const { PrismaScanImport } = await import("@modules/scan/infrastructure/prisma-scan-import");
    const { prisma, question, node } = await questaoComFigura("detach-revisao");

    const changed = await new PrismaScanImport().detachPieces([
      { nodeId: node.id, pieces: [FIGURA], anchorIds: [] },
    ]);

    expect(changed).toEqual([question.id]);
    const after = await prisma.question.findUniqueOrThrow({ where: { id: question.id } });
    expect(after.statementLatex).toBe("Quanto é $1+1$?");

    const revisions = await prisma.revision.findMany({
      where: { entityType: "QUESTION", entityId: question.id },
    });
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ revisionNumber: 1, origin: "SYSTEM" });
    // O snapshot é o `QuestionState` inteiro, o formato que o Histórico da questão sabe restaurar.
    const snapshot = JSON.parse(revisions[0]!.snapshotJson) as Record<string, unknown>;
    expect(snapshot).toMatchObject({
      type: "MULTIPLE_CHOICE",
      statementLatex: `Quanto é $1+1$?\n\n${FIGURA}`,
      tags: [],
    });
    expect(snapshot["options"]).toHaveLength(2);
  });

  it("a questão cujo enunciado não mudou não ganha revisão", async () => {
    const { PrismaScanImport } = await import("@modules/scan/infrastructure/prisma-scan-import");
    const { prisma, question, node } = await questaoComFigura("detach-intocada");

    const changed = await new PrismaScanImport().detachPieces([
      { nodeId: node.id, pieces: ["um trecho que não está lá"], anchorIds: [] },
    ]);

    expect(changed).toEqual([]);
    expect(await prisma.revision.count({ where: { entityId: question.id } })).toBe(0);
  });

  it("removeImport revalida a questão que perdeu o trecho", async () => {
    const { removeImport } = await import("@modules/scan/application/remove-import");
    const { PrismaScanImport } = await import("@modules/scan/infrastructure/prisma-scan-import");
    const { PrismaValidationWriter } =
      await import("@modules/questions/infrastructure/prisma-validation-writer");
    const { prisma, question, node } = await questaoComFigura("detach-revalida");

    const real = new PrismaScanImport();
    // O que a execução acrescentou vem do dublê; a retirada é a de verdade, contra o banco.
    const imports: ScanImportStore = {
      listCreatedNodes: async () => [],
      sendToTrash: async () => undefined,
      listAppendedPieces: async () => [{ nodeId: node.id, itemKeys: ["k"], anchorIds: [] }],
      detachPieces: (entries) =>
        real.detachPieces(entries.map((entry) => ({ ...entry, pieces: [FIGURA] }))),
    };
    const store = {
      findRun: async () => ({ id: "run", state: "APPROVED" }) as unknown as ScanRun,
      listItems: async () => [],
      deleteRun: async () => undefined,
    } as unknown as ScanStore;

    const result = await removeImport(
      { store, imports },
      { runId: "run", scope: "import" },
      new PrismaValidationWriter(),
    );

    expect(result.detached).toBe(1);
    const after = await prisma.question.findUniqueOrThrow({ where: { id: question.id } });
    expect(after.statementLatex).toBe("Quanto é $1+1$?");
    expect(after.validationStatus).toBe("VALID");
  });

  it("removeImport revalida só as questões que a retirada devolveu", async () => {
    const { removeImport } = await import("@modules/scan/application/remove-import");
    const revalidated: string[] = [];
    const validation: QuestionValidation = {
      questionForValidation: async (id) => {
        revalidated.push(id);
        return null;
      },
      setValidationStatus: async () => undefined,
    };
    const imports: ScanImportStore = {
      listCreatedNodes: async () => [],
      sendToTrash: async () => undefined,
      listAppendedPieces: async () => [
        { nodeId: "n1", itemKeys: [], anchorIds: [] },
        { nodeId: "n2", itemKeys: [], anchorIds: [] },
      ],
      detachPieces: async () => ["q1"],
    };
    const store = {
      findRun: async () => ({ id: "run", state: "APPROVED" }) as unknown as ScanRun,
      listItems: async () => [],
      deleteRun: async () => undefined,
    } as unknown as ScanStore;

    await removeImport({ store, imports }, { runId: "run", scope: "import" }, validation);

    expect(revalidated).toEqual(["q1"]);
  });
});

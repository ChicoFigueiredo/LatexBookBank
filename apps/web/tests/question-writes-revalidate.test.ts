import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { seedBookWithSource } from "./support/scan-seed";
import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * Toda escrita da questão revalida, e o texto da alternativa passa por caso de uso
 * (tarefa D4 da revisão de 2026-09-23, STE-05 e STE-15).
 *
 * O selo da árvore lê o `validationStatus` gravado. Só o `PATCH` do enunciado o recalculava: marcar
 * a correta pela aba de alternativas, ou aplicar o patch do agente que corrige o gabarito, deixava
 * a questão vermelha até alguém editar o enunciado ou apertar "Validar".
 *
 * Contra o banco de verdade: o veredito é do plugin, sobre o que está gravado, e o que se afirma é
 * o estado que a árvore vai ler.
 */

let dispose: () => Promise<void>;
beforeAll(async () => {
  dispose = (await createTempDatabase()).dispose;
});
afterAll(async () => {
  await dispose();
});

/**
 * Múltipla escolha com três alternativas. Sem gabarito, `INVALID` por `no_correct_option`; com a
 * B marcada (`gabarito: true`), `VALID` — e o teste parte do estado oposto ao que espera.
 */
async function seed(slug: string, { gabarito = false } = {}) {
  const { prisma, publication } = await seedBookWithSource("book-c.pdf", slug);
  const question = await prisma.question.create({
    data: {
      type: "MULTIPLE_CHOICE",
      statementLatex: "Quanto é $1+1$?",
      validationStatus: gabarito ? "VALID" : "INVALID",
      options: {
        create: [
          { sortKey: "a0", statementLatex: "1" },
          { sortKey: "a1", statementLatex: "2", isCorrect: gabarito },
          { sortKey: "a2", statementLatex: "3" },
        ],
      },
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
  const [a, b, c] = question.options;
  if (!a || !b || !c) throw new Error("o teste precisa das três alternativas");

  const status = async () =>
    (await prisma.question.findUniqueOrThrow({ where: { id: question.id } })).validationStatus;
  const options = () =>
    prisma.questionOption.findMany({
      where: { questionId: question.id },
      orderBy: { sortKey: "asc" },
    });

  return { prisma, question, a, b, c, status, options };
}

async function adapters() {
  const { PrismaOptionWriter } =
    await import("@modules/questions/infrastructure/prisma-option-writer");
  const { PrismaValidationWriter } =
    await import("@modules/questions/infrastructure/prisma-validation-writer");
  return { writer: new PrismaOptionWriter(), validation: new PrismaValidationWriter() };
}

describe("as escritas de alternativa revalidam", () => {
  it("marcar a correta pela aba de alternativas tira a questão do vermelho", async () => {
    const { setCorrectOption } = await import("@modules/questions/application/mutate-options");
    const { writer, validation } = await adapters();
    const { question, b, status } = await seed("marcar");

    await setCorrectOption(writer, question.id, b.id, validation);

    expect(await status()).toBe("VALID");
  });

  it("remover a única correta põe a questão no vermelho", async () => {
    const { removeOption } = await import("@modules/questions/application/mutate-options");
    const { writer, validation } = await adapters();
    const { question, b, status } = await seed("remover", { gabarito: true });

    await removeOption(writer, question.id, b.id, validation);

    expect(await status()).toBe("INVALID");
  });

  it("alternativa nova, em branco, põe a questão no vermelho", async () => {
    const { addOption } = await import("@modules/questions/application/mutate-options");
    const { writer, validation } = await adapters();
    const { question, status } = await seed("acrescentar", { gabarito: true });

    await addOption(writer, question.id, "", validation);

    expect(await status()).toBe("INVALID");
  });
});

describe("editar uma alternativa", () => {
  it("o texto passa pelo caso de uso, e revalida", async () => {
    const { editOption } = await import("@modules/questions/application/mutate-options");
    const { writer, validation } = await adapters();
    const { question, a, status, options } = await seed("texto", { gabarito: true });

    await editOption(writer, question.id, a.id, { statementLatex: "" }, validation);

    expect((await options())[0]?.statementLatex).toBe("");
    expect(await status()).toBe("INVALID");
  });

  it("alternativa que não existe é 404, e não um 200 que não gravou nada", async () => {
    const { editOption } = await import("@modules/questions/application/mutate-options");
    const { OptionNotFoundError } = await import("@modules/questions/domain/option-mutations");
    const { writer, validation } = await adapters();
    const { question } = await seed("sumiu");

    await expect(
      editOption(writer, question.id, "apagada-em-outra-aba", { statementLatex: "x" }, validation),
    ).rejects.toBeInstanceOf(OptionNotFoundError);
  });

  it("o pedido inteiro é conferido antes da primeira escrita: nada de meia escrita", async () => {
    const { editOption } = await import("@modules/questions/application/mutate-options");
    const { InvalidOptionEditError } = await import("@modules/questions/domain/option-mutations");
    const { writer, validation } = await adapters();
    const { question, c, options } = await seed("meia");
    const antes = await options();

    // Mover para o começo e um texto que não é texto: antes, a alternativa se movia e a resposta
    // era 400.
    await expect(
      editOption(writer, question.id, c.id, { targetIndex: 0, statementLatex: 42 }, validation),
    ).rejects.toBeInstanceOf(InvalidOptionEditError);

    expect(await options()).toEqual(antes);
  });

  it("texto acima do teto é recusado, como o do enunciado", async () => {
    const { editOption } = await import("@modules/questions/application/mutate-options");
    const { InvalidOptionEditError, OPTION_TEXT_LIMIT } =
      await import("@modules/questions/domain/option-mutations");
    const { writer, validation } = await adapters();
    const { question, a } = await seed("teto");

    await expect(
      editOption(
        writer,
        question.id,
        a.id,
        { statementLatex: "x".repeat(OPTION_TEXT_LIMIT + 1) },
        validation,
      ),
    ).rejects.toBeInstanceOf(InvalidOptionEditError);
  });

  it("mover e marcar no mesmo pedido gravam juntos", async () => {
    const { editOption } = await import("@modules/questions/application/mutate-options");
    const { writer, validation } = await adapters();
    const { question, c, options, status } = await seed("junto");

    await editOption(writer, question.id, c.id, { targetIndex: 0, isCorrect: true }, validation);

    const depois = await options();
    expect(depois[0]?.id).toBe(c.id);
    expect(depois[0]?.isCorrect).toBe(true);
    expect(await status()).toBe("VALID");
  });
});

describe("as outras escritas da questão revalidam", () => {
  it("aplicar o patch do agente que corrige o gabarito tira a questão do vermelho", async () => {
    const { applyQuestionPatch } = await import("@modules/agents/application/apply-question-patch");
    const { parseQuestionPatch, PATCH_SCHEMA_VERSION } =
      await import("@modules/agents/domain/question-patch");
    const { PrismaPatchApplier } = await import("@infrastructure/agent/prisma-patch-applier");
    const { validation } = await adapters();
    const { question, b, status } = await seed("patch");

    await applyQuestionPatch(
      new PrismaPatchApplier(),
      {
        questionId: question.id,
        patch: parseQuestionPatch({
          schemaVersion: PATCH_SCHEMA_VERSION,
          summary: "Marca o gabarito.",
          options: [{ optionId: b.id, isCorrect: true }],
        }),
        approvedChangeIds: [`option:${b.id}:correct`],
      },
      validation,
    );

    expect(await status()).toBe("VALID");
  });

  it("salvar o enunciado revalida pelo caso de uso, sem mover a versão que a resposta devolve", async () => {
    const { saveQuestion } = await import("@modules/questions/application/save-question");
    const { PrismaQuestionRepository } =
      await import("@modules/questions/infrastructure/prisma-question-repository");
    const { validation } = await adapters();
    const { prisma, question, status } = await seed("salvar", { gabarito: true });

    const result = await saveQuestion(
      new PrismaQuestionRepository(),
      {
        questionId: question.id,
        expectedUpdatedAt: question.updatedAt,
        edit: { statementLatex: "" },
      },
      validation,
    );

    expect(await status()).toBe("INVALID");
    const row = await prisma.question.findUniqueOrThrow({ where: { id: question.id } });
    expect(row.updatedAt.getTime()).toBe(result.snapshot.updatedAt.getTime());
  });
});

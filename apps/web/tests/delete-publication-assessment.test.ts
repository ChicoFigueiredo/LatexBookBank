import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { seedBookWithSource } from "./support/scan-seed";
import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * Excluir um livro que tem questão numa avaliação (#258, ACV-02/TST-03).
 *
 * `AssessmentItem → Question` é `ON DELETE RESTRICT`. A exclusão do livro apagava as questões sem
 * olhar as provas, a FK abortava a transação, e a confirmação por título terminava num 500 que não
 * dizia por quê. Diferente da lixeira, aqui não há como guardar a questão: o livro some e ela
 * ficaria sem nó, invisível. A exclusão é **recusada**, e o erro nomeia as provas.
 */

async function bookWithQuestionInAssessment(slug: string) {
  const seeded = await seedBookWithSource("book-c.pdf", slug);
  const { prisma, workspace, publication } = seeded;

  const question = await prisma.question.create({ data: { type: "DISCURSIVE" } });
  await prisma.documentNode.create({
    data: {
      publicationId: publication.id,
      kind: "QUESTION",
      sortKey: "a0",
      questionId: question.id,
    },
  });
  const assessment = await prisma.assessment.create({
    data: { workspaceId: workspace.id, title: "Prova do 2º bimestre" },
  });
  const section = await prisma.assessmentSection.create({
    data: { assessmentId: assessment.id, sortKey: "a0" },
  });
  await prisma.assessmentItem.create({
    data: { sectionId: section.id, questionId: question.id, sortKey: "a0" },
  });

  return { ...seeded, question };
}

describe("excluir um livro com questão numa avaliação", () => {
  let dispose: () => Promise<void>;
  beforeAll(async () => {
    dispose = (await createTempDatabase()).dispose;
  });
  afterAll(async () => {
    await dispose();
  });

  it("o diálogo sabe, antes do clique, quais provas usam questões do livro", async () => {
    const { PrismaPublicationRepository } =
      await import("@modules/publications/infrastructure/prisma-publication-repository");
    const { publication } = await bookWithQuestionInAssessment("aviso");

    const contents = await new PrismaPublicationRepository().contentsOf(publication.id);

    expect(contents?.assessments).toEqual(["Prova do 2º bimestre"]);
  });

  it("recusa, nomeia a prova, e não apaga nada", async () => {
    const { deletePublication } =
      await import("@modules/publications/application/manage-publications");
    const { PublicationInAssessmentsError } =
      await import("@modules/publications/domain/publication-draft");
    const { PrismaPublicationRepository } =
      await import("@modules/publications/infrastructure/prisma-publication-repository");
    const { prisma, storage, publication, question } = await bookWithQuestionInAssessment("recusa");

    const erro = await deletePublication(
      new PrismaPublicationRepository(),
      storage,
      publication.id,
      {
        title: publication.title,
      },
    ).catch((error: unknown) => error);

    expect(erro).toBeInstanceOf(PublicationInAssessmentsError);
    expect((erro as InstanceType<typeof PublicationInAssessmentsError>).assessments).toEqual([
      "Prova do 2º bimestre",
    ]);
    expect(await prisma.publication.count({ where: { id: publication.id } })).toBe(1);
    expect(await prisma.question.count({ where: { id: question.id } })).toBe(1);
  });
});

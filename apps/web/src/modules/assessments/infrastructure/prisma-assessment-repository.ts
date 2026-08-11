import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import { generateKeyBetween } from "@modules/document-tree/domain/fractional-index";
import type { AssessmentQuestionContent } from "@modules/assessments/domain/assessment-template";
import type { Variant } from "@modules/assessments/domain/variant";
import type { AssessmentRecord } from "@modules/assessments/application/compose-assessment";

/**
 * Persistência de avaliações.
 *
 * A questão entra por **referência**, nunca por cópia (schema §20): a mesma questão aparece em
 * provas diferentes sem duplicação, e corrigir o enunciado corrige em todas. Congelar o texto na
 * prova seria o caminho para um acervo com trinta versões da mesma questão, todas ligeiramente
 * diferentes.
 *
 * O `pinnedLastOptionIds` é `String` com JSON dentro porque o conector SQLite não tem `Json`
 * (D24). A conversão acontece aqui, na fronteira, e o domínio nunca vê a string.
 *
 * Ver spec §20 · D24 · issue #143.
 */

export interface AssessmentSummary {
  readonly id: string;
  readonly title: string;
  readonly questionCount: number;
  readonly variantLabels: readonly string[];
}

export async function listAssessments(workspaceId: string): Promise<readonly AssessmentSummary[]> {
  const rows = await prisma.assessment.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      sections: { select: { _count: { select: { items: true } } } },
      variants: { select: { label: true }, orderBy: { label: "asc" } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    questionCount: row.sections.reduce((total, section) => total + section._count.items, 0),
    variantLabels: row.variants.map((variant) => variant.label),
  }));
}

export async function createAssessment(input: {
  workspaceId: string;
  title: string;
  subtitle: string | null;
  notes: string | null;
}): Promise<{ id: string }> {
  return prisma.assessment.create({
    data: {
      workspaceId: input.workspaceId,
      title: input.title,
      subtitle: input.subtitle,
      notes: input.notes,
      // Uma seção nasce junto: seção é agrupamento ("Parte I"), e exigir que a pessoa crie uma
      // antes de poder acrescentar a primeira questão seria cerimônia por uma prova que quase
      // sempre tem uma parte só.
      sections: { create: { sortKey: "a0" } },
    },
    select: { id: true },
  });
}

export async function findAssessment(assessmentId: string): Promise<AssessmentRecord | null> {
  const row = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: {
      id: true,
      title: true,
      subtitle: true,
      notes: true,
      sections: {
        orderBy: { sortKey: "asc" },
        select: {
          items: {
            orderBy: { sortKey: "asc" },
            select: { questionId: true, points: true, pinnedLastOptionIdsJson: true },
          },
        },
      },
    },
  });

  if (row === null) return null;

  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    notes: row.notes,
    items: row.sections.flatMap((section) =>
      section.items.map((item) => ({
        questionId: item.questionId,
        points: item.points,
        pinnedLastOptionIds: parseIds(item.pinnedLastOptionIdsJson),
      })),
    ),
  };
}

/** JSON malformado vira lista vazia: uma prova não deve deixar de sair por causa disso. */
function parseIds(raw: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/**
 * O resultado de acrescentar.
 *
 * `foreign` é um caso próprio e não um `added: false` qualquer: os dois significam coisas opostas
 * para quem monta a prova. "Já estava" é um clique repetido; "é de outra biblioteca" é um engano
 * que precisa aparecer.
 */
export type AddQuestionResult =
  | { readonly added: true }
  | { readonly added: false; readonly reason: "already" | "no_section" | "foreign" };

export async function addQuestion(
  assessmentId: string,
  questionId: string,
): Promise<AddQuestionResult> {
  /**
   * **A questão é desta biblioteca?** (#177)
   *
   * Não era conferido, e o efeito é pior que o desalinho: `AssessmentItem → Question` é
   * `onDelete: Restrict`, então uma prova da biblioteca A **trava a exclusão** de uma questão da
   * biblioteca B — e quem tenta apagar não tem como descobrir por quê, porque a prova que segura
   * não aparece em lugar nenhum do acervo dele.
   *
   * A prova sairia com a questão impressa e o gabarito certo; nada quebra. É exatamente o tipo de
   * mistura que só se percebe quando as duas bibliotecas são de donos diferentes.
   *
   * Verificado com duas bibliotecas de verdade: sem este guarda, a rota respondia `201 added:true`.
   */
  const escopo = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: {
      // A questão vem pela **mesma** consulta: duas idas ao banco poderiam ler estados diferentes.
      workspace: {
        select: {
          publications: {
            where: { nodes: { some: { questionId } } },
            take: 1,
            select: { id: true },
          },
        },
      },
    },
  });

  if (escopo === null) return { added: false, reason: "no_section" };
  if (escopo.workspace.publications.length === 0) return { added: false, reason: "foreign" };

  const section = await prisma.assessmentSection.findFirst({
    where: { assessmentId },
    orderBy: { sortKey: "asc" },
    select: {
      id: true,
      items: { orderBy: { sortKey: "desc" }, take: 1, select: { sortKey: true } },
    },
  });
  if (section === null) return { added: false, reason: "no_section" };

  // A mesma questão duas vezes na mesma prova é engano, e o schema já recusa pelo par único —
  // mas devolver "não acrescentei" é melhor que estourar uma constraint por um clique repetido.
  const existing = await prisma.assessmentItem.findUnique({
    where: { sectionId_questionId: { sectionId: section.id, questionId } },
    select: { id: true },
  });
  if (existing !== null) return { added: false, reason: "already" };

  await prisma.assessmentItem.create({
    data: {
      sectionId: section.id,
      questionId,
      // Fractional index, como na árvore: acrescentar no fim não reescreve a prova inteira.
      sortKey: generateKeyBetween(section.items[0]?.sortKey ?? null, null),
    },
  });

  return { added: true };
}

export async function removeQuestion(assessmentId: string, questionId: string): Promise<void> {
  await prisma.assessmentItem.deleteMany({
    where: { questionId, section: { assessmentId } },
  });
}

/**
 * Apaga a avaliação inteira.
 *
 * Seções, itens, variantes e mapas de letra vão junto por cascade do schema — e é justamente por
 * isso que quem chama precisa saber **quantas variantes** existiam. O mapa de letras de uma
 * variante **é o gabarito** de uma prova que pode já ter sido impressa e entregue; apagá-lo em
 * silêncio destrói a única cópia de como aquela prova foi embaralhada.
 *
 * A questão em si nunca é tocada: `AssessmentItem` referencia, nunca copia (D9/§18), e a relação
 * com `Question` é `onDelete: Restrict` no outro sentido.
 */
export async function deleteAssessment(
  assessmentId: string,
): Promise<{ readonly deleted: boolean; readonly variantLabels: readonly string[] }> {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { variants: { select: { label: true }, orderBy: { label: "asc" } } },
  });

  if (assessment === null) return { deleted: false, variantLabels: [] };

  await prisma.assessment.delete({ where: { id: assessmentId } });

  return { deleted: true, variantLabels: assessment.variants.map((variant) => variant.label) };
}

/** As variantes já sorteadas, para quem precisa avisar antes de destruir o gabarito delas. */
export async function variantLabelsOf(assessmentId: string): Promise<readonly string[] | null> {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { variants: { select: { label: true }, orderBy: { label: "asc" } } },
  });

  return assessment === null ? null : assessment.variants.map((variant) => variant.label);
}

/**
 * Guarda a variante **com o mapa de letras**.
 *
 * Numa transação: meia variante gravada daria uma prova cujo gabarito cobre parte das questões, e
 * é exatamente na parte faltante que a correção erraria sem avisar.
 *
 * Regravar a mesma label apaga a anterior. É deliberado: sortear de novo com a mesma letra é o
 * gesto de "esta prova ainda não foi impressa"; manter as duas deixaria dois gabaritos válidos
 * para o mesmo nome, e ninguém saberia qual foi para a sala.
 */
export async function saveVariant(
  assessmentId: string,
  variant: Variant,
  spec: { shuffleQuestions: boolean; shuffleOptions: boolean },
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    await tx.assessmentVariant.deleteMany({ where: { assessmentId, label: variant.label } });

    const created = await tx.assessmentVariant.create({
      data: {
        assessmentId,
        label: variant.label,
        seed: variant.seed,
        shuffleQuestions: spec.shuffleQuestions,
        shuffleOptions: spec.shuffleOptions,
      },
      select: { id: true },
    });

    for (const [index, question] of variant.questions.entries()) {
      const variantQuestion = await tx.assessmentVariantQuestion.create({
        data: { variantId: created.id, questionId: question.questionId, position: index + 1 },
        select: { id: true },
      });

      await tx.assessmentVariantOptionMap.createMany({
        data: question.optionIds.map((optionId, position) => ({
          variantQuestionId: variantQuestion.id,
          optionId,
          displayedLabel: question.labelByOptionId[optionId] ?? "",
          position: position + 1,
        })),
      });
    }

    return created;
  });
}

/** O conteúdo das questões da prova, na forma que o template espera. */
export async function contentFor(
  questionIds: readonly string[],
): Promise<Record<string, AssessmentQuestionContent>> {
  const rows = await prisma.question.findMany({
    where: { id: { in: [...questionIds] } },
    select: {
      id: true,
      statementLatex: true,
      solutionLatex: true,
      options: {
        orderBy: { sortKey: "asc" },
        select: { id: true, statementLatex: true, isCorrect: true },
      },
    },
  });

  return Object.fromEntries(
    rows.map((row) => [
      row.id,
      {
        questionId: row.id,
        statementLatex: row.statementLatex,
        solutionLatex: row.solutionLatex,
        options: Object.fromEntries(
          row.options.map((option) => [option.id, option.statementLatex]),
        ),
        correctOptionId: row.options.find((option) => option.isCorrect)?.id ?? null,
        points: null,
      },
    ]),
  );
}

/**
 * Questões que podem entrar na prova.
 *
 * Do mesmo workspace da avaliação, com o resumo pronto. O limite existe porque o acervo tem
 * milhares: uma lista sem teto travaria a tela justamente na biblioteca grande, que é onde
 * montar prova importa mais. A busca por texto é da Fase 11 e entra aqui quando a tela crescer.
 */
export async function listCandidateQuestions(
  assessmentId: string,
  limit = 200,
): Promise<readonly { id: string; title: string }[]> {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { workspaceId: true },
  });
  if (assessment === null) return [];

  const rows = await prisma.question.findMany({
    where: { node: { publication: { workspaceId: assessment.workspaceId } } },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { id: true, nickname: true, statementLatex: true },
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.nickname ?? row.statementLatex.slice(0, 80) ?? row.id,
  }));
}

import "server-only";

import type {
  CreatedQuestion,
  NewQuestionNode,
  QuestionCreator,
} from "@modules/questions/application/create-question";
import { prisma } from "@infrastructure/database/sqlite/client";

/**
 * Criar questão, nó, posição e alternativas — **numa transação só**.
 *
 * A transação mora aqui e não no caso de uso porque transação é detalhe do motor (D23): o domínio
 * decidiu o quê, e a infraestrutura garante o tudo-ou-nada. É também o que faz a garantia da §11
 * ser verificável — em falha, nem nó órfão nem questão órfã, e o teste consegue provar isso sem
 * subir a aplicação.
 *
 * A questão nasce e **depois** o nó aponta para ela. A ordem importa: `DocumentNode.questionId` é
 * a chave estrangeira, então a questão precisa existir primeiro. O aninhado do Prisma faria os
 * dois de uma vez, mas devolveria só o nó — e quem chama precisa dos dois ids para navegar.
 */
export class PrismaQuestionCreator implements QuestionCreator {
  async createQuestionWithNode(input: NewQuestionNode): Promise<CreatedQuestion> {
    return prisma.$transaction(async (tx) => {
      const question = await tx.question.create({
        data: {
          type: input.blueprint.type,
          difficulty: input.blueprint.difficulty,
          statementLatex: input.statementLatex ?? "",
          solutionLatex: input.solutionLatex ?? "",
          ...(input.sourceAnchorId ? { sourceAnchorId: input.sourceAnchorId } : {}),
          options: {
            create: input.blueprint.optionSortKeys.map((sortKey, index) => ({
              sortKey,
              // O conteúdo vindo de uma captura revisada entra aqui; a criação manual nasce vazia.
              // `?? ""` e não `?.statementLatex!`: uma lista mais curta que as chaves é caso
              // legítimo — o candidato do OCR achou três alternativas onde o padrão são cinco.
              statementLatex: input.options?.[index]?.statementLatex ?? "",
              isCorrect: input.options?.[index]?.isCorrect ?? false,
            })),
          },
        },
        select: { id: true },
      });

      const node = await tx.documentNode.create({
        data: {
          publicationId: input.publicationId,
          parentId: input.parentId,
          kind: "QUESTION",
          title: input.title,
          originalLabel: input.originalLabel,
          sortKey: input.sortKey,
          questionId: question.id,
          ...(input.sourceAnchorId ? { sourceAnchorId: input.sourceAnchorId } : {}),
        },
        select: { id: true },
      });

      return {
        questionId: question.id,
        nodeId: node.id,
        publicationId: input.publicationId,
      };
    });
  }
}

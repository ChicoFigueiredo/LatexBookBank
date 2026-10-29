import "server-only";

import type {
  CreatedQuestion,
  NewQuestionNode,
  QuestionCreator,
} from "@modules/questions/application/create-question";
import { prisma } from "@infrastructure/database/sqlite/client";
import { insertNode } from "@modules/document-tree/infrastructure/prisma-node-writer";

/**
 * Criar questão, nó, posição e alternativas — **numa transação só**.
 *
 * A transação mora aqui e não no caso de uso porque transação é detalhe do motor (D23): o domínio
 * decidiu o quê, e a infraestrutura garante o tudo-ou-nada. É também o que faz a garantia da §11
 * ser verificável — em falha, nem nó órfão nem questão órfã, e o teste consegue provar isso sem
 * subir a aplicação.
 *
 * Quem grava é o escritor de nó (`insertNode`), o mesmo da aprovação do scan, de duplicar e dos
 * imports: a questão primeiro, o nó apontando para ela, e a âncora de origem na lista do nó, como
 * principal (D50), com as colunas antigas em sincronia.
 */
export class PrismaQuestionCreator implements QuestionCreator {
  async createQuestionWithNode(input: NewQuestionNode): Promise<CreatedQuestion> {
    return prisma.$transaction(async (tx) => {
      const created = await insertNode(tx, {
        columns: {
          publicationId: input.publicationId,
          parentId: input.parentId,
          kind: "QUESTION",
          title: input.title,
          originalLabel: input.originalLabel,
          sortKey: input.sortKey,
        },
        question: {
          columns: {
            type: input.blueprint.type,
            difficulty: input.blueprint.difficulty,
            statementLatex: input.statementLatex ?? "",
            solutionLatex: input.solutionLatex ?? "",
            // Banca e ano herdados da questão anterior, quando havia uma. `??` e não spread
            // condicional: `null` é o valor certo para "a anterior também não tinha".
            board: input.board ?? null,
            year: input.year ?? null,
          },
          options: input.blueprint.optionSortKeys.map((sortKey, index) => ({
            sortKey,
            // O conteúdo vindo de uma captura revisada entra aqui; a criação manual nasce vazia.
            // `?? ""` e não `?.statementLatex!`: uma lista mais curta que as chaves é caso
            // legítimo — o candidato do OCR achou três alternativas onde o padrão são cinco.
            statementLatex: input.options?.[index]?.statementLatex ?? "",
            isCorrect: input.options?.[index]?.isCorrect ?? false,
          })),
        },
        anchors: input.sourceAnchorId
          ? [{ sourceAnchorId: input.sourceAnchorId, role: "PRIMARY" }]
          : [],
      });

      return {
        // O escritor devolve a questão sempre que recebe uma, e aqui ela sempre vai.
        questionId: created.questionId as string,
        nodeId: created.nodeId,
        publicationId: input.publicationId,
      };
    });
  }
}

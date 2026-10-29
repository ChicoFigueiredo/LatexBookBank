import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import type { Tx } from "@infrastructure/database/sqlite/transaction";
import {
  OptionFromAnotherQuestionError,
  type PatchApplier,
  type PatchTransaction,
} from "@modules/agents/application/apply-question-patch";
import { rebalanceKeys } from "@/shared/ordering/fractional-index";
import { appendRevision } from "@modules/revisions/infrastructure/prisma-revision-writer";

import { readQuestionState } from "./prisma-question-state";

/**
 * A aplicação do patch, sobre o Prisma — **a única escrita do fluxo agêntico**.
 *
 * Fica em `infrastructure/` e não em `modules/agents/` porque o lint de boundary proíbe o módulo
 * do agente de alcançar o banco, e aqui a proibição é o desenho inteiro: o agente propõe, este
 * arquivo escreve, e quem os liga é a rota, depois de o humano aprovar. O módulo do agente segue
 * sem qualquer caminho até o Prisma, e o teste de guarda continua verificando isso.
 *
 * Ver spec §35 · issue #101.
 */

const METADATA_COLUMNS = new Set([
  "difficulty",
  "year",
  "board",
  "institution",
  "role",
  "roleLevel",
  "publisher",
  "videoUrl",
]);

export class PrismaPatchApplier implements PatchApplier {
  async transact<T>(run: (tx: PatchTransaction) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (client) => run(makeTransaction(client)));
  }
}

/** Lança se algum dos ids não for uma alternativa desta questão. */
async function requireOwnOptions(
  client: Tx,
  questionId: string,
  optionIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(optionIds)];
  if (ids.length === 0) return;

  const ownIds = new Set(
    (
      await client.questionOption.findMany({
        where: { questionId, id: { in: ids } },
        select: { id: true },
      })
    ).map((row) => row.id),
  );
  const foreignIds = ids.filter((id) => !ownIds.has(id));
  if (foreignIds.length > 0) throw new OptionFromAnotherQuestionError(questionId, foreignIds);
}

function makeTransaction(client: Tx): PatchTransaction {
  return {
    async readStateForUpdate(questionId) {
      // O mesmo estado do diff e da revisão, lido dentro desta transação.
      return readQuestionState(questionId, client);
    },

    async findAgentRun(agentRunId) {
      return client.agentRun.findUnique({
        where: { id: agentRunId },
        select: { questionId: true },
      });
    },

    async writeRevision(input) {
      // A numeração é do módulo de revisões, contada dentro desta transação.
      return appendRevision(client, {
        entityType: "QUESTION",
        entityId: input.questionId,
        origin: input.origin,
        agentRunId: input.agentRunId,
        summary: input.summary,
        snapshotJson: input.snapshotJson,
      });
    },

    async applyFields(questionId, fields) {
      await client.question.update({ where: { id: questionId }, data: fields });
    },

    async applyOptions(questionId, options) {
      // Antes de gravar qualquer linha: ignorar só o id estranho e gravar o resto deixava um
      // gabarito exclusivo sem correta (a antiga desmarcada, a nova em outra questão).
      await requireOwnOptions(
        client,
        questionId,
        options.map((option) => option.id),
      );

      for (const option of options) {
        // `updateMany` com o `questionId` no `where`: `update` pela chave primária gravaria numa
        // alternativa de **outra** questão se o id viesse trocado, e o id veio de um patch.
        await client.questionOption.updateMany({
          where: { id: option.id, questionId },
          data: {
            ...(option.statementLatex === undefined
              ? {}
              : { statementLatex: option.statementLatex }),
            ...(option.isCorrect === undefined ? {} : { isCorrect: option.isCorrect }),
          },
        });
      }

      // Nenhuma regra de tipo aqui: o plano já traz o gabarito inteiro que muda — num tipo
      // exclusivo, a correta antiga vem desmarcada; numa MULTIPLE_CORRECT, as outras ficam. Decidir
      // "desmarcar as outras" neste arquivo apagava o gabarito de quem tem várias corretas.
    },

    async applyReorder(questionId, optionIds) {
      await requireOwnOptions(client, questionId, optionIds);

      // Chaves novas para todas: reescrever a lista inteira é barato para uma questão (dezenas de
      // alternativas, não milhares) e evita a aritmética de inserção entre vizinhos, que é onde
      // reordenação por índice fracionário costuma errar.
      const keys = rebalanceKeys(optionIds.length);

      for (const [index, id] of optionIds.entries()) {
        await client.questionOption.updateMany({
          where: { id, questionId },
          data: { sortKey: keys[index] as string },
        });
      }
    },

    async restoreOptions(questionId, options) {
      const keep = options.map((option) => option.id);

      // As criadas depois da revisão saem — elas nunca existiram naquele estado.
      await client.questionOption.deleteMany({ where: { questionId, id: { notIn: keep } } });

      const existing = new Set(
        (
          await client.questionOption.findMany({
            where: { questionId, id: { in: keep } },
            select: { id: true },
          })
        ).map((row) => row.id),
      );

      for (const option of options) {
        const data = {
          sortKey: option.sortKey,
          statementLatex: option.statementLatex,
          isCorrect: option.isCorrect,
        };
        if (existing.has(option.id)) {
          await client.questionOption.updateMany({ where: { id: option.id, questionId }, data });
        } else {
          // A apagada depois volta com o **mesmo** id: o gabarito aponta para a alternativa pelo
          // id (D9), e outro id seria outra alternativa.
          await client.questionOption.create({ data: { id: option.id, questionId, ...data } });
        }
      }
    },

    async applyMetadata(questionId, metadata) {
      // Segunda barreira sobre a whitelist do schema: o que chega aqui já passou pelo Zod, mas
      // este arquivo é o que escreve, e uma chave inesperada não pode virar coluna por descuido.
      const data = Object.fromEntries(
        Object.entries(metadata).filter(([key]) => METADATA_COLUMNS.has(key)),
      );
      if (Object.keys(data).length === 0) return;

      await client.question.update({ where: { id: questionId }, data });
    },

    async applyTags(questionId, names) {
      const question = await client.question.findUnique({
        where: { id: questionId },
        select: { node: { select: { publication: { select: { workspaceId: true } } } } },
      });

      const workspaceId = question?.node?.publication.workspaceId;
      // Sem workspace não há onde criar a tag. A questão continua editável; o que não dá é
      // inventar um workspace para ela.
      if (!workspaceId) return;

      const tagIds: string[] = [];
      for (const name of names) {
        const existing = await client.tag.findFirst({
          where: { workspaceId, name },
          select: { id: true },
        });

        if (existing) {
          tagIds.push(existing.id);
          continue;
        }
        const created = await client.tag.create({
          data: { workspaceId, name },
          select: { id: true },
        });
        tagIds.push(created.id);
      }

      // O patch traz o conjunto **completo**: o que não está nele sai.
      await client.questionTag.deleteMany({ where: { questionId, tagId: { notIn: tagIds } } });

      for (const tagId of tagIds) {
        await client.questionTag.upsert({
          where: { questionId_tagId: { questionId, tagId } },
          create: { questionId, tagId },
          update: {},
        });
      }
    },
  };
}

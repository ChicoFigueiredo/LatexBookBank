import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import type {
  PatchApplier,
  PatchTransaction,
} from "@modules/agents/application/apply-question-patch";
import type { QuestionState } from "@modules/agents/domain/patch-diff";
import { rebalanceKeys } from "@modules/document-tree/domain/fractional-index";

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

/** O cliente dentro da transação. `prisma.$transaction` entrega um cliente restrito. */
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

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

function makeTransaction(client: Tx): PatchTransaction {
  return {
    async readStateForUpdate(questionId) {
      const row = await client.question.findUnique({
        where: { id: questionId },
        select: {
          statementLatex: true,
          solutionLatex: true,
          complementLatex: true,
          nickname: true,
          difficulty: true,
          year: true,
          board: true,
          institution: true,
          role: true,
          roleLevel: true,
          publisher: true,
          videoUrl: true,
          options: {
            orderBy: { sortKey: "asc" },
            select: { id: true, statementLatex: true, isCorrect: true },
          },
          tags: { select: { tag: { select: { name: true } } } },
        },
      });
      if (!row) return null;

      const { options, tags, statementLatex, solutionLatex, complementLatex, nickname, ...meta } =
        row;

      const state: QuestionState = {
        statementLatex,
        solutionLatex,
        complementLatex,
        nickname,
        options,
        metadata: meta,
        tags: tags.map((link) => link.tag.name),
      };
      return state;
    },

    async writeRevision(input) {
      // O número é contado **dentro** da transação: dois agentes gravando ao mesmo tempo não
      // podem chegar ao mesmo, e a `@@unique` faria a segunda falhar em vez de sobrescrever.
      const last = await client.revision.findFirst({
        where: { entityType: "QUESTION", entityId: input.questionId },
        orderBy: { revisionNumber: "desc" },
        select: { revisionNumber: true },
      });

      const revisionNumber = (last?.revisionNumber ?? 0) + 1;

      await client.revision.create({
        data: {
          entityType: "QUESTION",
          entityId: input.questionId,
          revisionNumber,
          origin: input.origin,
          agentRunId: input.agentRunId,
          summary: input.summary,
          snapshotJson: input.snapshotJson,
        },
      });

      return revisionNumber;
    },

    async applyFields(questionId, fields) {
      await client.question.update({ where: { id: questionId }, data: fields });
    },

    async applyOptions(questionId, options) {
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

      // Marcar uma correta desmarca as outras. A regra é do tipo da questão, mas o custo de
      // deixá-la só para a validação é um gabarito com duas corretas gravado no banco — e o
      // schema do patch já recusa mais de uma, então aqui é a outra metade da mesma garantia.
      const marked = options.find((option) => option.isCorrect === true);
      if (marked) {
        await client.questionOption.updateMany({
          where: { questionId, id: { not: marked.id } },
          data: { isCorrect: false },
        });
      }
    },

    async applyReorder(questionId, optionIds) {
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

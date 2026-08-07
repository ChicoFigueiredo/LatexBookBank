import "server-only";

import type {
  DocumentTreeRepository,
  TreeNodeRecord,
} from "@modules/document-tree/domain/document-tree-repository";
import { isNodeKind, isNumberingStyle } from "@modules/document-tree/domain/node-kind";
import { prisma } from "@infrastructure/database/sqlite/client";

/**
 * Implementação Prisma de `DocumentTreeRepository`.
 *
 * `kind` e `numberingStyle` são `String` no banco — o conector SQLite não suporta `enum` — então
 * a validação acontece aqui, na saída da infraestrutura. Um valor fora do vocabulário indica
 * dado corrompido ou migration incompleta, e falhar alto é melhor do que renderizar um nó com
 * tipo inventado.
 */
export class PrismaDocumentTreeRepository implements DocumentTreeRepository {
  async listByPublication(publicationId: string): Promise<readonly TreeNodeRecord[]> {
    const rows = await prisma.documentNode.findMany({
      where: { publicationId, deletedAt: null },
      orderBy: { sortKey: "asc" },
      select: {
        id: true,
        parentId: true,
        kind: true,
        title: true,
        sortKey: true,
        numberingStyle: true,
        originalLabel: true,
        question: {
          select: {
            id: true,
            type: true,
            statementLatex: true,
            difficulty: true,
            board: true,
            year: true,
            options: {
              orderBy: { sortKey: "asc" },
              select: { id: true, sortKey: true, statementLatex: true, isCorrect: true },
            },
          },
        },
      },
    });

    return rows.map((row) => {
      if (!isNodeKind(row.kind)) {
        throw new Error(`NodeKind desconhecido no nó ${row.id}: ${row.kind}`);
      }
      if (!isNumberingStyle(row.numberingStyle)) {
        throw new Error(`NumberingStyle desconhecido no nó ${row.id}: ${row.numberingStyle}`);
      }

      return {
        id: row.id,
        parentId: row.parentId,
        kind: row.kind,
        title: row.title,
        sortKey: row.sortKey,
        numberingStyle: row.numberingStyle,
        originalLabel: row.originalLabel,
        question: row.question,
      };
    });
  }
}

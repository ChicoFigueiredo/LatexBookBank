import "server-only";

import type {
  DeletedNodeRecord,
  DocumentTreeRepository,
  DocumentTreeWriter,
  NewNode,
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
export class PrismaDocumentTreeRepository implements DocumentTreeRepository, DocumentTreeWriter {
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

  async create(node: NewNode): Promise<string> {
    const created = await prisma.documentNode.create({
      data: {
        publicationId: node.publicationId,
        parentId: node.parentId,
        kind: node.kind,
        title: node.title,
        sortKey: node.sortKey,
        ...(node.numberingStyle ? { numberingStyle: node.numberingStyle } : {}),
      },
      select: { id: true },
    });
    return created.id;
  }

  async rename(nodeId: string, title: string | null): Promise<void> {
    await prisma.documentNode.update({ where: { id: nodeId }, data: { title } });
  }

  async move(nodeId: string, parentId: string | null, sortKey: string): Promise<void> {
    await prisma.documentNode.update({ where: { id: nodeId }, data: { parentId, sortKey } });
  }

  /**
   * Uma transação, não N updates.
   *
   * Marcar o pai e falhar no meio dos filhos deixaria a árvore com nós apontando para um pai
   * excluído — invisíveis e fora da lixeira. `updateMany` com `in` resolve num comando só.
   */
  async softDeleteMany(nodeIds: readonly string[]): Promise<void> {
    if (nodeIds.length === 0) return;
    await prisma.documentNode.updateMany({
      where: { id: { in: [...nodeIds] } },
      data: { deletedAt: new Date() },
    });
  }

  async restoreMany(nodeIds: readonly string[]): Promise<void> {
    if (nodeIds.length === 0) return;
    await prisma.documentNode.updateMany({
      where: { id: { in: [...nodeIds] } },
      data: { deletedAt: null },
    });
  }

  async listDeleted(publicationId: string): Promise<readonly DeletedNodeRecord[]> {
    const rows = await prisma.documentNode.findMany({
      where: { publicationId, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      select: { id: true, parentId: true, title: true, kind: true, deletedAt: true },
    });

    return rows.map((row) => {
      if (!isNodeKind(row.kind)) {
        throw new Error(`NodeKind desconhecido no nó excluído ${row.id}: ${row.kind}`);
      }
      return {
        id: row.id,
        parentId: row.parentId,
        title: row.title,
        kind: row.kind,
        deletedAt: row.deletedAt as Date,
      };
    });
  }
}

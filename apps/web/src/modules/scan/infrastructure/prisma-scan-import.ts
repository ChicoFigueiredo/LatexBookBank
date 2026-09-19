import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import type { ScanImportStore } from "@modules/scan/application/remove-import";
import type { ImportedNode } from "@modules/scan/domain/import-removal";

/**
 * Os nós que uma execução criou, com os sinais de quem mexeu neles depois (D57, ADR 0006).
 *
 * Três sinais, e cada um cobre um buraco do outro:
 *
 * - `createdAt` do nó é o instante da aprovação — foi ela que o criou. Não precisa perguntar ao
 *   `ScanItem`, que some junto com a execução.
 * - `updatedAt` do nó e da questão pega renomear, mover e reescrever, que não deixam revisão.
 * - a **revisão de origem humana** pega o que o relógio não pega: alguém gravou uma versão com a
 *   própria mão, e isso vale mesmo que nada mais tenha mudado desde então.
 */

/** Quem escreveu a revisão. `SYSTEM` e `IMPORT` são máquina; o resto é gente (ou agente a mando dela). */
const BY_HAND = ["USER", "AGENT"];

export class PrismaScanImport implements ScanImportStore {
  async listCreatedNodes(runId: string): Promise<readonly ImportedNode[]> {
    const nodes = await prisma.documentNode.findMany({
      where: { createdByScanRunId: runId, deletedAt: null },
      select: {
        id: true,
        parentId: true,
        kind: true,
        title: true,
        originalLabel: true,
        createdAt: true,
        updatedAt: true,
        questionId: true,
        question: { select: { status: true, updatedAt: true } },
      },
      // Pais antes dos filhos: é a ordem que o plano usa para preservar quem segura quem.
      orderBy: [{ createdAt: "asc" }, { sortKey: "asc" }],
    });
    if (nodes.length === 0) return [];

    /*
      Os filhos que não são desta importação.

      Sem esta consulta, um capítulo criado pelo scan iria para a lixeira levando junto a seção que
      a pessoa pendurou nele — ou pior, deixando-a viva e órfã, que a árvore promove à raiz.
    */
    const outside = await prisma.documentNode.groupBy({
      by: ["parentId"],
      where: {
        parentId: { in: nodes.map((node) => node.id) },
        deletedAt: null,
        OR: [{ createdByScanRunId: null }, { createdByScanRunId: { not: runId } }],
      },
      _count: { _all: true },
    });
    const withOutside = new Set(outside.map((row) => row.parentId).filter((id): id is string => id !== null));

    const ids = [
      ...nodes.map((node) => node.id),
      ...nodes.flatMap((node) => (node.questionId ? [node.questionId] : [])),
    ];
    const revisions = await prisma.revision.findMany({
      where: { entityId: { in: ids }, origin: { in: BY_HAND } },
      select: { entityId: true },
    });
    const touched = new Set(revisions.map((revision) => revision.entityId));

    return nodes.map((node) => ({
      id: node.id,
      parentId: node.parentId,
      kind: node.kind,
      title: node.title,
      originalLabel: node.originalLabel,
      approvedAt: node.createdAt,
      updatedAt: node.updatedAt,
      question: node.question ? { status: node.question.status, updatedAt: node.question.updatedAt } : null,
      editedByHand: touched.has(node.id) || (node.questionId !== null && touched.has(node.questionId)),
      hasOutsideChildren: withOutside.has(node.id),
    }));
  }

  /**
   * Exclusão lógica, como qualquer nó apagado na árvore: reversível enquanto a lixeira não for
   * esvaziada. Num `updateMany` só — apagar metade de uma importação seria pior que não apagar.
   */
  async sendToTrash(nodeIds: readonly string[]): Promise<void> {
    if (nodeIds.length === 0) return;
    await prisma.documentNode.updateMany({
      where: { id: { in: [...nodeIds] } },
      data: { deletedAt: new Date() },
    });
  }
}

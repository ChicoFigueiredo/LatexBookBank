import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import { inChunks } from "@infrastructure/database/sqlite/in-chunks";
import { isAnchorRole, planNodeAnchors, type NodeAnchorLink } from "@modules/assets/domain/node-anchors";
import { writeNodeAnchors } from "@modules/assets/infrastructure/prisma-node-anchors";
import { removeFromBody } from "@modules/document-tree/domain/node-body";
import type { AppendedPieces, DetachedPieces, ScanImportStore } from "@modules/scan/application/remove-import";
import type { ImportedNode } from "@modules/scan/domain/import-removal";

/**
 * Os nós que uma execução criou, com os sinais de quem mexeu neles depois (D57, ADR 0006).
 *
 * Três sinais, e cada um cobre um buraco do outro:
 *
 * - a **última escrita da aprovação** no nó: a criação, ou o `approvedAt` mais novo dos itens
 *   materializados nele. Aprovar em rodadas grava corpo e âncoras em nós criados numa sessão
 *   anterior, e medido só da criação isso parecia edição à mão (#249, SPG-05).
 * - `updatedAt` do nó e da questão pega renomear, mover e reescrever, que não deixam revisão.
 * - a **revisão de origem humana** pega o que o relógio não pega: alguém gravou uma versão com a
 *   própria mão, e isso vale mesmo que nada mais tenha mudado desde então.
 */

/** Quem escreveu a revisão. `SYSTEM` e `IMPORT` são máquina; o resto é gente (ou agente a mando dela). */
const BY_HAND = ["USER", "AGENT"];

/** O item que deixou a âncora, lido do `metadataJson` que a aprovação grava. */
function itemKeyOf(metadataJson: string | null): string | null {
  if (!metadataJson) return null;
  try {
    const parsed: unknown = JSON.parse(metadataJson);
    const key = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>)["itemKey"] : null;
    return typeof key === "string" ? key : null;
  } catch {
    return null;
  }
}

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
    // Em pedaços: um livro inteiro passa do limite de parâmetros do SQLite (`in-chunks.ts`).
    const outside = (
      await Promise.all(
        inChunks(nodes.map((node) => node.id)).map((parentIds) =>
          prisma.documentNode.findMany({
            where: {
              parentId: { in: parentIds },
              deletedAt: null,
              OR: [{ createdByScanRunId: null }, { createdByScanRunId: { not: runId } }],
            },
            select: { parentId: true },
            distinct: ["parentId"],
          }),
        ),
      )
    ).flat();
    const withOutside = new Set(outside.map((row) => row.parentId).filter((id): id is string => id !== null));

    const ids = [
      ...nodes.map((node) => node.id),
      ...nodes.flatMap((node) => (node.questionId ? [node.questionId] : [])),
    ];
    const revisions = (
      await Promise.all(
        inChunks(ids).map((entityIds) =>
          prisma.revision.findMany({
            where: { entityId: { in: entityIds }, origin: { in: BY_HAND } },
            select: { entityId: true },
          }),
        ),
      )
    ).flat();
    const touched = new Set(revisions.map((revision) => revision.entityId));

    const nodeIds = nodes.map((node) => node.id);
    // A aprovação seguinte marca os itens com o instante dela: é a régua da edição (SPG-05).
    const lastWrite = new Map<string, Date>();
    for (const ids of inChunks(nodeIds)) {
      const rows = await prisma.scanItem.groupBy({
        by: ["documentNodeId"],
        where: { documentNodeId: { in: ids }, approvedAt: { not: null } },
        _max: { approvedAt: true },
      });
      for (const row of rows) {
        if (row.documentNodeId && row._max.approvedAt) lastWrite.set(row.documentNodeId, row._max.approvedAt);
      }
    }
    // As figuras do corpo: âncora de ilustração com recorte (SPG-12).
    const figures = new Map<string, number>();
    for (const ids of inChunks(nodeIds)) {
      const rows = await prisma.documentNodeAnchor.groupBy({
        by: ["documentNodeId"],
        where: { documentNodeId: { in: ids }, role: "ILLUSTRATION", sourceAnchor: { cropAssetId: { not: null } } },
        _count: { _all: true },
      });
      for (const row of rows) figures.set(row.documentNodeId, row._count._all);
    }
    const approvedAt = (node: { id: string; createdAt: Date }) => {
      const written = lastWrite.get(node.id);
      return written && written > node.createdAt ? written : node.createdAt;
    };

    return nodes.map((node) => ({
      id: node.id,
      parentId: node.parentId,
      kind: node.kind,
      title: node.title,
      originalLabel: node.originalLabel,
      approvedAt: approvedAt(node),
      updatedAt: node.updatedAt,
      question: node.question ? { status: node.question.status, updatedAt: node.question.updatedAt } : null,
      editedByHand: touched.has(node.id) || (node.questionId !== null && touched.has(node.questionId)),
      hasOutsideChildren: withOutside.has(node.id),
      figures: figures.get(node.id) ?? 0,
    }));
  }

  /*
    O que a execução acrescentou a nós que ela não criou (#249, CAP-09): o capítulo que já
    existia e foi reaproveitado, a questão de outra importação que recebeu a figura.

    Cada trecho acrescentado deixou âncoras com a execução e o item no `metadataJson`
    (`prisma-scan-approval.ts`) — o item que entrou como *já no acervo* não deixou nenhuma, e
    por isso não tira o texto de ninguém.
  */
  async listAppendedPieces(runId: string): Promise<readonly AppendedPieces[]> {
    const links = await prisma.documentNodeAnchor.findMany({
      where: {
        sourceAnchor: { metadataJson: { contains: `"scanRunId":${JSON.stringify(runId)}` } },
        documentNode: {
          deletedAt: null,
          OR: [{ createdByScanRunId: null }, { createdByScanRunId: { not: runId } }],
        },
      },
      orderBy: { sortOrder: "asc" },
      select: { documentNodeId: true, sourceAnchorId: true, sourceAnchor: { select: { metadataJson: true } } },
    });

    const byNode = new Map<string, { itemKeys: string[]; anchorIds: string[] }>();
    for (const link of links) {
      const entry = byNode.get(link.documentNodeId) ?? { itemKeys: [], anchorIds: [] };
      const itemKey = itemKeyOf(link.sourceAnchor.metadataJson);
      if (itemKey !== null && !entry.itemKeys.includes(itemKey)) entry.itemKeys.push(itemKey);
      entry.anchorIds.push(link.sourceAnchorId);
      byNode.set(link.documentNodeId, entry);
    }
    return [...byNode].map(([nodeId, entry]) => ({ nodeId, ...entry }));
  }

  /**
   * Tira de cada nó os trechos e as âncoras que a importação pôs ali, numa transação: o corpo (ou
   * o enunciado, quando o nó é de questão) volta a ser o que era, com o estado anterior no
   * histórico, e a âncora que ficou sem dono sai.
   */
  async detachPieces(entries: readonly DetachedPieces[]): Promise<void> {
    if (entries.length === 0) return;
    await prisma.$transaction(
      async (tx) => {
        for (const entry of entries) {
          const node = await tx.documentNode.findUniqueOrThrow({
            where: { id: entry.nodeId },
            select: { title: true, bodyLatex: true, question: { select: { id: true, statementLatex: true } } },
          });

          if (node.question) {
            const statementLatex = removeFromBody(node.question.statementLatex, entry.pieces);
            if (statementLatex !== node.question.statementLatex) {
              await tx.question.update({ where: { id: node.question.id }, data: { statementLatex } });
            }
          } else {
            const bodyLatex = removeFromBody(node.bodyLatex, entry.pieces);
            if (bodyLatex !== node.bodyLatex) {
              const last = await tx.revision.findFirst({
                where: { entityType: "DOCUMENT_NODE", entityId: entry.nodeId },
                orderBy: { revisionNumber: "desc" },
                select: { revisionNumber: true },
              });
              await tx.revision.create({
                data: {
                  entityType: "DOCUMENT_NODE",
                  entityId: entry.nodeId,
                  revisionNumber: (last?.revisionNumber ?? 0) + 1,
                  origin: "SYSTEM",
                  summary: "corpo do scan retirado com a importação",
                  snapshotJson: JSON.stringify({ title: node.title, bodyLatex: node.bodyLatex }),
                },
              });
              await tx.documentNode.update({ where: { id: entry.nodeId }, data: { bodyLatex } });
            }
          }

          const leaving = new Set(entry.anchorIds);
          const links = await tx.documentNodeAnchor.findMany({
            where: { documentNodeId: entry.nodeId },
            orderBy: { sortOrder: "asc" },
            select: { sourceAnchorId: true, role: true },
          });
          const staying = links
            .filter((link) => !leaving.has(link.sourceAnchorId) && isAnchorRole(link.role))
            .map((link) => ({ sourceAnchorId: link.sourceAnchorId, role: link.role as NodeAnchorLink["role"] }));
          await writeNodeAnchors(tx, entry.nodeId, planNodeAnchors(staying));
          // A âncora do trecho não serve a mais ninguém: sem ela, a reimportação não acha "já no acervo".
          await tx.sourceAnchor.deleteMany({
            where: {
              id: { in: [...leaving] },
              nodeAnchors: { none: {} },
              nodes: { none: {} },
              questions: { none: {} },
            },
          });
        }
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  }

  /**
   * Exclusão lógica, como qualquer nó apagado na árvore: reversível enquanto a lixeira não for
   * esvaziada. Numa transação só — apagar metade de uma importação seria pior que não apagar —, em
   * pedaços que o SQLite aceita, e com o mesmo instante em todos (a lixeira agrupa por ele).
   */
  async sendToTrash(nodeIds: readonly string[]): Promise<void> {
    if (nodeIds.length === 0) return;
    const deletedAt = new Date();
    await prisma.$transaction(async (tx) => {
      for (const ids of inChunks(nodeIds)) {
        await tx.documentNode.updateMany({ where: { id: { in: ids } }, data: { deletedAt } });
      }
    });
  }
}

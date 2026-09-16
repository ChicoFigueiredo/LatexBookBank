import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import { isAnchorRole, planNodeAnchors, type NodeAnchorLink } from "@modules/assets/domain/node-anchors";
import { writeNodeAnchors } from "@modules/assets/infrastructure/prisma-node-anchors";
import { generateKeyBetween } from "@modules/document-tree/domain/fractional-index";
import { appendToBody } from "@modules/document-tree/domain/node-body";
import { isNodeKind } from "@modules/document-tree/domain/node-kind";
import { planQuestion } from "@modules/questions/domain/question-blueprint";
import type {
  ApprovalContext,
  ApprovalSummary,
  ScanApprovalWriter,
} from "@modules/scan/application/approve-scan";
import type { NodeRef } from "@modules/scan/domain/approval-plan";
import type { ProposedRegion } from "@modules/scan/domain/proposal";

type ExecuteInput = Parameters<ScanApprovalWriter["execute"]>[0];

/**
 * A aprovação gravada (D53), numa transação: nós, questões, âncoras, ligações, corpos e a marca em
 * cada item. As âncoras nascem aqui, e só aqui (D51) — com o método `scan:<perfil>@<versão>` e o
 * texto lido, para a aba Origem responder de onde e como.
 */
export class PrismaScanApproval implements ScanApprovalWriter {
  async readContext(publicationId: string, sourceAssetId: string): Promise<ApprovalContext> {
    const [nodes, links] = await Promise.all([
      prisma.documentNode.findMany({
        where: { publicationId, deletedAt: null },
        select: { id: true, parentId: true, kind: true, title: true, originalLabel: true },
      }),
      prisma.documentNodeAnchor.findMany({
        where: {
          documentNode: { publicationId, deletedAt: null },
          sourceAnchor: { sourceAssetId },
        },
        select: {
          documentNodeId: true,
          sourceAnchor: {
            select: {
              pageNumber: true,
              xNormalized: true,
              yNormalized: true,
              widthNormalized: true,
              heightNormalized: true,
            },
          },
        },
      }),
    ]);

    return {
      nodes: nodes.map((node) => ({ ...node, kind: isNodeKind(node.kind) ? node.kind : "CONTENT" })),
      anchors: links.map((link) => ({
        nodeId: link.documentNodeId,
        pageNumber: link.sourceAnchor.pageNumber,
        box: {
          x: link.sourceAnchor.xNormalized,
          y: link.sourceAnchor.yNormalized,
          width: link.sourceAnchor.widthNormalized,
          height: link.sourceAnchor.heightNormalized,
        },
      })),
    };
  }

  async execute({ run, profile, plan, items, now }: ExecuteInput): Promise<ApprovalSummary> {
    const extractionMethod = `scan:${profile.id}@${profile.version}`;

    return prisma.$transaction(
      async (tx) => {
        const planned = new Map<string, string>();
        const lastKey = new Map<string | null, string | null>();
        const summary = {
          createdNodes: 0,
          createdQuestions: 0,
          reusedNodes: 0,
          bodyAppends: 0,
          anchors: 0,
          alreadyInCollection: 0,
          materializedItems: 0,
        };

        const resolve = (ref: NodeRef): string | null => {
          if (ref.type === "root") return null;
          if (ref.type === "existing") return ref.id;
          const id = planned.get(ref.ref);
          if (!id) throw new Error(`Plano fora de ordem: ${ref.ref} ainda não foi criado.`);
          return id;
        };

        const nextKey = async (parentId: string | null): Promise<string> => {
          if (!lastKey.has(parentId)) {
            const last = await tx.documentNode.findFirst({
              where: { publicationId: run.publicationId, parentId, deletedAt: null },
              orderBy: { sortKey: "desc" },
              select: { sortKey: true },
            });
            lastKey.set(parentId, last?.sortKey ?? null);
          }
          const key = generateKeyBetween(lastKey.get(parentId) ?? null, null);
          lastKey.set(parentId, key);
          return key;
        };

        const createAnchors = async (regions: readonly ProposedRegion[], sourceText: string, itemKey: string) => {
          const links: NodeAnchorLink[] = [];
          for (const region of regions) {
            const anchor = await tx.sourceAnchor.create({
              data: {
                publicationId: run.publicationId,
                sourceAssetId: run.sourceAssetId,
                pageNumber: region.pageNumber,
                xNormalized: region.box.x,
                yNormalized: region.box.y,
                widthNormalized: region.box.width,
                heightNormalized: region.box.height,
                sourceText: sourceText.slice(0, 20_000),
                extractionMethod,
                extractionModel: run.mathModel,
                metadataJson: JSON.stringify({ scanRunId: run.id, itemKey, role: region.role }),
              },
              select: { id: true },
            });
            links.push({ sourceAnchorId: anchor.id, role: isAnchorRole(region.role) ? region.role : "CONTINUATION" });
          }
          summary.anchors += links.length;
          return links;
        };

        const mark = async (itemIds: readonly string[], nodeId: string) => {
          await tx.scanItem.updateMany({
            where: { runId: run.id, id: { in: [...itemIds] } },
            data: { documentNodeId: nodeId, approvedAt: now, reviewState: "APPROVED" },
          });
          summary.materializedItems += itemIds.length;
        };

        const itemKeyOf = (id: string) => items.find((item) => item.id === id)?.key ?? id;

        for (const step of plan.steps) {
          switch (step.type) {
            case "reuseNode":
              summary.reusedNodes++;
              await mark(step.itemIds, step.nodeId);
              break;

            case "alreadyInCollection":
              summary.alreadyInCollection++;
              await mark(step.itemIds, step.nodeId);
              break;

            case "createNode": {
              const parentId = resolve(step.parent);
              let questionId: string | null = null;

              if (step.question) {
                const blueprint = planQuestion({
                  type: step.question.type,
                  optionCount: step.question.options.length > 0 ? step.question.options.length : undefined,
                });
                const question = await tx.question.create({
                  data: {
                    type: blueprint.type,
                    difficulty: blueprint.difficulty,
                    statementLatex: step.question.statementLatex,
                    originalLatex: step.question.originalLatex,
                    // `DRAFT` com âncora de LaTeX não conferido: é o *a revisar* da D40.
                    status: "DRAFT",
                    options: {
                      create: blueprint.optionSortKeys.map((sortKey, index) => ({
                        sortKey,
                        statementLatex: step.question?.options[index] ?? "",
                        isCorrect: false,
                      })),
                    },
                  },
                  select: { id: true },
                });
                questionId = question.id;
                summary.createdQuestions++;
              }

              const node = await tx.documentNode.create({
                data: {
                  publicationId: run.publicationId,
                  parentId,
                  kind: step.kind,
                  title: step.title,
                  originalLabel: step.originalLabel,
                  sortKey: await nextKey(parentId),
                  ...(questionId ? { questionId } : {}),
                },
                select: { id: true },
              });
              planned.set(step.ref, node.id);
              summary.createdNodes++;

              const links = await createAnchors(step.anchors, step.sourceText, itemKeyOf(step.ref));
              await writeNodeAnchors(tx, node.id, planNodeAnchors(links));
              await mark(step.itemIds, node.id);
              break;
            }

            case "appendBody": {
              const targetId = resolve(step.target);
              if (!targetId) break;
              const target = await tx.documentNode.findUniqueOrThrow({
                where: { id: targetId },
                select: { bodyLatex: true, title: true },
              });
              const existing = await tx.documentNodeAnchor.findMany({
                where: { documentNodeId: targetId },
                orderBy: { sortOrder: "asc" },
                select: { sourceAnchorId: true, role: true },
              });

              const last = await tx.revision.findFirst({
                where: { entityType: "DOCUMENT_NODE", entityId: targetId },
                orderBy: { revisionNumber: "desc" },
                select: { revisionNumber: true },
              });
              await tx.revision.create({
                data: {
                  entityType: "DOCUMENT_NODE",
                  entityId: targetId,
                  revisionNumber: (last?.revisionNumber ?? 0) + 1,
                  origin: "SYSTEM",
                  summary: "corpo recebido do scan",
                  snapshotJson: JSON.stringify({ title: target.title, bodyLatex: target.bodyLatex }),
                },
              });
              await tx.documentNode.update({
                where: { id: targetId },
                data: { bodyLatex: appendToBody(target.bodyLatex, step.latex) },
              });

              const added = await createAnchors(step.anchors, step.sourceText, itemKeyOf(step.itemIds[0] ?? ""));
              const current = existing
                .filter((link) => isAnchorRole(link.role))
                .map((link) => ({ sourceAnchorId: link.sourceAnchorId, role: link.role as NodeAnchorLink["role"] }));
              await writeNodeAnchors(tx, targetId, planNodeAnchors([...current, ...added]));
              summary.bodyAppends++;
              await mark(step.itemIds, targetId);
              break;
            }
          }
        }

        const pending = await tx.scanItem.count({
          where: { runId: run.id, documentNodeId: null, reviewState: { not: "REJECTED" } },
        });
        if (pending === 0) await tx.scanRun.update({ where: { id: run.id }, data: { state: "APPROVED" } });

        return summary;
      },
      // Um livro inteiro são centenas de escritas; o padrão de 5 s do Prisma é para requisição.
      { timeout: 120_000, maxWait: 10_000 },
    );
  }
}


import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import { isAnchorRole, planNodeAnchors, type NodeAnchorLink } from "@modules/assets/domain/node-anchors";
import { writeNodeAnchors } from "@modules/assets/infrastructure/prisma-node-anchors";
import { generateKeyBetween } from "@modules/document-tree/domain/fractional-index";
import { appendToBody } from "@modules/document-tree/domain/node-body";
import { isNodeKind } from "@modules/document-tree/domain/node-kind";
import { planQuestion } from "@modules/questions/domain/question-blueprint";
import {
  ApprovalConflictError,
  type ApprovalContext,
  type ApprovalSummary,
  type ScanApprovalWriter,
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
          role: true,
          sourceAnchor: {
            select: {
              pageNumber: true,
              xNormalized: true,
              yNormalized: true,
              widthNormalized: true,
              heightNormalized: true,
              cropAssetId: true,
            },
          },
        },
      }),
    ]);

    return {
      nodes: nodes.map((node) => ({ ...node, kind: isNodeKind(node.kind) ? node.kind : "CONTENT" })),
      anchors: links.map((link) => ({
        nodeId: link.documentNodeId,
        role: link.role,
        cropped: link.sourceAnchor.cropAssetId !== null,
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
          statementAppends: 0,
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

        const createAnchors = async (
          regions: readonly ProposedRegion[],
          sourceText: string,
          itemKey: string,
          cropAssetId: string | null = null,
        ) => {
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
                // A figura tem arquivo: a âncora guarda qual, que é para o que este campo existe.
                ...(cropAssetId ? { cropAssetId } : {}),
              },
              select: { id: true },
            });
            links.push({ sourceAnchorId: anchor.id, role: isAnchorRole(region.role) ? region.role : "CONTINUATION" });
          }
          summary.anchors += links.length;
          return links;
        };

        // Só marca item que ainda não tem nó: se algum já tem, outra aprovação da mesma proposta
        // gravou depois da leitura que deu este plano, e a transação inteira volta (#247).
        const mark = async (itemIds: readonly string[], nodeId: string) => {
          const marked = await tx.scanItem.updateMany({
            where: { runId: run.id, id: { in: [...itemIds] }, documentNodeId: null },
            data: { documentNodeId: nodeId, approvedAt: now, reviewState: "APPROVED" },
          });
          if (marked.count !== new Set(itemIds).size) throw new ApprovalConflictError();
          summary.materializedItems += itemIds.length;
        };

        const itemKeyOf = (id: string) => items.find((item) => item.id === id)?.key ?? id;

        /** As âncoras do trecho somadas às que o nó já tem, na ordem — a principal continua a dele. */
        const appendAnchors = async (
          targetId: string,
          step: { readonly anchors: readonly ProposedRegion[]; readonly sourceText: string; readonly itemIds: readonly string[]; readonly cropAssetId: string | null },
        ) => {
          const existing = await tx.documentNodeAnchor.findMany({
            where: { documentNodeId: targetId },
            orderBy: { sortOrder: "asc" },
            select: { sourceAnchorId: true, role: true },
          });
          const added = await createAnchors(step.anchors, step.sourceText, itemKeyOf(step.itemIds[0] ?? ""), step.cropAssetId);
          const current = existing
            .filter((link) => isAnchorRole(link.role))
            .map((link) => ({ sourceAnchorId: link.sourceAnchorId, role: link.role as NodeAnchorLink["role"] }));
          await writeNodeAnchors(tx, targetId, planNodeAnchors([...current, ...added]));
        };

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
                    // A resolução impressa, quando o livro a traz junto do enunciado.
                    solutionLatex: step.question.solutionLatex,
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
                  // O exemplo nasce com o texto dentro (D56); os outros nós nascem vazios.
                  ...(step.body !== null ? { bodyLatex: step.body } : {}),
                  // Quem criou este nó (D57): é por aqui que a importação inteira é encontrada
                  // quando alguém quiser reimportar o livro.
                  createdByScanRunId: run.id,
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

              await appendAnchors(targetId, step);
              summary.bodyAppends++;
              await mark(step.itemIds, targetId);
              break;
            }

            case "appendStatement": {
              // A figura do exercício ou da questão (#246): vai ao enunciado, e o arquivo passa a ser
              // da questão — é por `questionId` que o render dela acha os assets.
              const targetId = resolve(step.target);
              if (!targetId) break;
              const node = await tx.documentNode.findUniqueOrThrow({
                where: { id: targetId },
                select: { question: { select: { id: true, statementLatex: true } } },
              });
              if (!node.question) throw new Error(`O nó ${targetId} não tem questão para receber o enunciado.`);

              await tx.question.update({
                where: { id: node.question.id },
                data: { statementLatex: appendToBody(node.question.statementLatex, step.latex) },
              });
              if (step.cropAssetId) {
                // Só o recorte ainda sem dono: uma linha que já é de outra questão continua dela.
                await tx.asset.updateMany({
                  where: { id: step.cropAssetId, questionId: null },
                  data: { questionId: node.question.id },
                });
              }
              await appendAnchors(targetId, step);
              summary.statementAppends++;
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


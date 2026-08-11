import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import type { ImportPlan } from "@modules/portability/application/import-workspace";
import type { ArchiveAsset } from "@modules/portability/domain/portable-archive";
import type { StorageProvider } from "@/shared/ports";

/**
 * Grava um workspace importado — **numa transação, e nunca por cima**.
 *
 * Colisão não é resolvida aqui: quem chama já recebeu a lista no `ImportPlan` e decidiu. Este
 * arquivo grava o que foi decidido, e se a decisão foi "não importar", nem chega a ser chamado.
 * Um sink que decidisse sozinho transformaria "trazer um acervo" em "sobrescrever o meu".
 *
 * Os assets são regravados no `StorageProvider` de **destino**, e as chaves são novas. É o que o
 * endereçamento por `sha256` compra: o arquivo não sabe onde os bytes vão morar, e o destino não
 * precisa saber de onde vieram.
 *
 * Ver spec §7 · issue #117.
 */

export interface ImportReport {
  readonly workspaceId: string;
  readonly publications: number;
  readonly nodes: number;
  readonly questions: number;
  readonly options: number;
  readonly assets: number;
  /** Assets que o dado referencia e o arquivo não trouxe. */
  readonly missingAssets: readonly string[];
  readonly tags: number;
}

export async function writeImportedWorkspace(
  plan: ImportPlan,
  assets: readonly ArchiveAsset[],
  storage: StorageProvider,
): Promise<ImportReport> {
  const bySha = new Map(assets.map((asset) => [asset.sha256, asset]));
  const missingAssets = new Set<string>();

  return prisma.$transaction(async (client) => {
    const workspace = await client.workspace.create({
      // Slug é `@unique`: dois imports do mesmo arquivo precisam de nomes distintos, e sufixar
      // com o instante é mais honesto que falhar — quem importou duas vezes quer as duas.
      data: { name: plan.workspace.name, slug: `${plan.workspace.slug}-${Date.now()}` },
      select: { id: true },
    });

    const tagIdByName = new Map<string, string>();
    for (const tag of plan.workspace.tags) {
      const created = await client.tag.create({
        data: { workspaceId: workspace.id, name: tag.name, kind: tag.kind },
        select: { id: true },
      });
      tagIdByName.set(tag.name, created.id);
    }

    let nodes = 0;
    let questions = 0;
    let options = 0;
    let storedAssets = 0;

    for (const publication of plan.workspace.publications) {
      const createdPublication = await client.publication.create({
        data: {
          workspaceId: workspace.id,
          title: publication.title,
          subtitle: publication.subtitle,
          publisher: publication.publisher,
          legacyId: publication.legacyId,
          legacyUuid: publication.legacyUuid,
          metadataJson: publication.metadataJson,
          importedAt: new Date(),
        },
        select: { id: true },
      });

      // Duas passadas: os nós são criados sem pai, e o `parentId` é ligado depois. Uma passada só
      // exigiria que o pai viesse antes do filho no arquivo — o que é verdade hoje e seria uma
      // dependência de ordem que ninguém declarou.
      const nodeIdByRef = new Map<string, string>();

      for (const node of publication.nodes) {
        let questionId: string | null = null;

        if (node.question !== null) {
          const question = node.question;

          const createdQuestion = await client.question.create({
            data: {
              type: question.type,
              nickname: question.nickname,
              statementLatex: question.statementLatex,
              solutionLatex: question.solutionLatex,
              complementLatex: question.complementLatex,
              originalLatex: question.originalLatex,
              difficulty: question.difficulty,
              year: question.year,
              board: question.board,
              institution: question.institution,
              role: question.role,
              roleLevel: question.roleLevel,
              publisher: question.publisher,
              videoUrl: question.videoUrl,
              status: question.status,
              validationStatus: question.validationStatus,
              legacyId: question.legacyId,
            },
            select: { id: true },
          });

          questionId = createdQuestion.id;
          questions += 1;

          for (const option of question.options) {
            await client.questionOption.create({
              data: {
                questionId: createdQuestion.id,
                sortKey: option.sortKey,
                statementLatex: option.statementLatex,
                solutionLatex: option.solutionLatex,
                isCorrect: option.isCorrect,
                weight: option.weight,
                legacyId: option.legacyId,
              },
            });
            options += 1;
          }

          for (const name of question.tags) {
            const tagId = tagIdByName.get(name);
            if (tagId === undefined) continue;
            await client.questionTag.create({ data: { questionId: createdQuestion.id, tagId } });
          }

          for (const sha256 of question.assetSha256) {
            const asset = bySha.get(sha256);
            if (asset === undefined) {
              // Referência sem bytes: o dado aponta para um asset que o arquivo não trouxe. Some
              // do banco e entra no relatório — uma linha de `Asset` sem conteúdo seria pior,
              // porque a tela tentaria abri-la.
              missingAssets.add(sha256);
              continue;
            }

            const stored = await storage.put({
              workspaceId: workspace.id,
              content: asset.bytes,
              mimeType: mimeFor(asset.extension),
            });

            await client.asset.create({
              data: {
                workspaceId: workspace.id,
                questionId: createdQuestion.id,
                kind: "ATTACHMENT",
                storageKey: stored.storageKey,
                mimeType: mimeFor(asset.extension),
                sha256: stored.sha256,
                sizeBytes: stored.sizeBytes,
              },
            });
            storedAssets += 1;
          }
        }

        const createdNode = await client.documentNode.create({
          data: {
            publicationId: createdPublication.id,
            kind: node.kind,
            title: node.title,
            sortKey: node.sortKey,
            numberingStyle: node.numberingStyle,
            originalLabel: node.originalLabel,
            legacyId: node.legacyId,
            questionId,
          },
          select: { id: true },
        });

        nodeIdByRef.set(node.id, createdNode.id);
        nodes += 1;
      }

      for (const node of publication.nodes) {
        if (node.parentId === null) continue;

        const id = nodeIdByRef.get(node.id);
        const parentId = nodeIdByRef.get(node.parentId);
        if (id === undefined || parentId === undefined) continue;

        await client.documentNode.update({ where: { id }, data: { parentId } });
      }
    }

    return {
      workspaceId: workspace.id,
      publications: plan.workspace.publications.length,
      nodes,
      questions,
      options,
      assets: storedAssets,
      missingAssets: [...missingAssets],
      tags: tagIdByName.size,
    };
  });
}

const MIME: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
};

const mimeFor = (extension: string): string => MIME[extension] ?? "application/octet-stream";

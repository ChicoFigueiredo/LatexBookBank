import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import { recordOwnedAsset } from "@modules/assets/infrastructure/prisma-owned-assets";
import type { RuntimeAsset } from "@modules/portability/application/export-workspace";
import type { ImportReport } from "@modules/portability/application/import-archive";
import type { ImportPlan } from "@modules/portability/application/import-workspace";
import type { ArchiveAsset } from "@modules/portability/domain/portable-archive";
import { translateSnapshotIds } from "@modules/portability/domain/snapshot-ids";
import type { StorageProvider } from "@/shared/ports";

/**
 * Grava um workspace importado — **numa transação, e nunca por cima**.
 *
 * Colisão não é resolvida aqui: quem chama já recebeu a lista no `ImportPlan` e decidiu. Este
 * arquivo grava o que foi decidido. Um sink que decidisse sozinho transformaria "trazer um acervo"
 * em "sobrescrever o meu".
 *
 * Os assets são regravados no `StorageProvider` de **destino**, e as chaves são novas. É o que o
 * endereçamento por `sha256` compra: o arquivo não sabe onde os bytes vão morar, e o destino não
 * precisa saber de onde vieram. As linhas de `Asset` nascem pelo repositório de assets
 * (`recordOwnedAsset`), uma por dono, com o nome, o tipo e o MIME de origem — é o nome que o
 * `\includegraphics` do enunciado cita.
 *
 * Ver spec §7 · issue #117 · #268.
 */

const date = (iso: string | null): Date | null => (iso === null ? null : new Date(iso));

export async function writeImportedWorkspace(
  plan: ImportPlan,
  assets: readonly ArchiveAsset[],
  storage: StorageProvider,
): Promise<ImportReport> {
  const bySha = new Map(assets.map((asset) => [asset.sha256, asset]));
  const missingAssets = new Set<string>();

  return prisma.$transaction(async (client) => {
    // `legacyId` é `@unique`: é a identidade da biblioteca de origem, e se ela já está neste banco
    // (restaurar com a original ainda aqui), a cópia entra sem ele — duas bibliotecas não podem
    // ser "a" biblioteca 42 do legado, e a que já estava continua sendo.
    const legacyId =
      plan.workspace.legacyId !== null &&
      (await client.workspace.findUnique({ where: { legacyId: plan.workspace.legacyId }, select: { id: true } })) ===
        null
        ? plan.workspace.legacyId
        : null;

    const workspace = await client.workspace.create({
      // Slug é `@unique`: dois imports do mesmo arquivo precisam de nomes distintos, e sufixar
      // com o instante é mais honesto que falhar — quem importou duas vezes quer as duas.
      data: {
        name: plan.workspace.name,
        slug: `${plan.workspace.slug}-${Date.now()}`,
        description: plan.workspace.description,
        legacyId,
        legacySourcePath: plan.workspace.legacySourcePath,
      },
      select: { id: true },
    });

    /** Id do plano → id deste banco, para tudo o que avaliações e revisões citam. */
    const idOf = new Map<string, string>();

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

    /** Os bytes vão ao storage uma vez por hash, sejam quantos forem os donos. */
    const stored = new Map<string, Awaited<ReturnType<StorageProvider["put"]>>>();
    const record = async (
      asset: RuntimeAsset,
      owner: { readonly publicationId: string; readonly questionId: string | null },
    ): Promise<string | null> => {
      const content = bySha.get(asset.sha256);
      if (content === undefined) {
        // Referência sem bytes: some do banco e entra no relatório — uma linha de `Asset` sem
        // conteúdo seria pior, porque a tela tentaria abri-la.
        missingAssets.add(asset.sha256);
        return null;
      }
      let put = stored.get(asset.sha256);
      if (put === undefined) {
        put = await storage.put({
          workspaceId: workspace.id,
          content: content.bytes,
          mimeType: asset.mimeType,
          ...(asset.originalFilename ? { originalFilename: asset.originalFilename } : {}),
        });
        stored.set(asset.sha256, put);
      }
      const created = await recordOwnedAsset(client, {
        workspaceId: workspace.id,
        publicationId: owner.publicationId,
        questionId: owner.questionId,
        kind: asset.kind,
        storageKey: put.storageKey,
        sha256: put.sha256,
        sizeBytes: put.sizeBytes,
        mimeType: asset.mimeType,
        originalFilename: asset.originalFilename,
        width: asset.width,
        height: asset.height,
        metadataJson: asset.metadataJson,
      });
      storedAssets += 1;
      return created.id;
    };

    for (const publication of plan.workspace.publications) {
      const createdPublication = await client.publication.create({
        data: {
          workspaceId: workspace.id,
          title: publication.title,
          subtitle: publication.subtitle,
          publisher: publication.publisher,
          nickname: publication.nickname,
          isbn: publication.isbn,
          otherIdentifier: publication.otherIdentifier,
          edition: publication.edition,
          editionYear: publication.editionYear,
          publicationDate: date(publication.publicationDate),
          language: publication.language,
          series: publication.series,
          volume: publication.volume,
          notes: publication.notes,
          captureProfileId: publication.captureProfileId,
          legacyId: publication.legacyId,
          legacyUuid: publication.legacyUuid,
          legacyUpdatedAt: date(publication.legacyUpdatedAt),
          metadataJson: publication.metadataJson,
          importedAt: new Date(),
        },
        select: { id: true },
      });
      idOf.set(publication.id, createdPublication.id);

      /**
       * Os autores renascem **por nome**, e não por id.
       *
       * `Author` é compartilhado por todo o acervo e tem `name` único: o id do banco de origem não
       * significa nada aqui, e trazê-lo colidiria com um autor homônimo já existente. `upsert` por
       * nome é o que faz "Gelson Iezzi" importado de dois arquivos diferentes continuar sendo uma
       * pessoa só — que é a razão de a tabela existir separada.
       *
       * A ordem é preservada em `position`: quem assina primeiro assina primeiro, e a estante
       * mostra "Iezzi e outros" a partir dela.
       */
      for (const [posicao, nome] of publication.authors.entries()) {
        const autor = await client.author.upsert({
          where: { name: nome },
          create: { name: nome },
          update: {},
          select: { id: true },
        });

        await client.publicationAuthor.create({
          data: { publicationId: createdPublication.id, authorId: autor.id, position: posicao },
        });
      }

      // O endereço de cada arquivo **neste livro**: a capa, o PDF fonte e as âncoras citam um hash,
      // e o hash vira a linha criada aqui — do livro ou de uma questão dele.
      const assetIdBySha = new Map<string, string>();
      for (const asset of publication.assets) {
        const id = await record(asset, { publicationId: createdPublication.id, questionId: null });
        if (id !== null && !assetIdBySha.has(asset.sha256)) assetIdBySha.set(asset.sha256, id);
      }

      // Três passadas: os nós nascem sem pai e sem âncora, o `parentId` é ligado depois, e as
      // âncoras por último — o recorte de uma âncora pode ser a figura de uma questão que vem
      // depois dela no arquivo.
      const nodeIdByRef = new Map<string, string>();
      const questionIdByNode = new Map<string, string>();

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

          idOf.set(question.id, createdQuestion.id);

          for (const option of question.options) {
            const createdOption = await client.questionOption.create({
              data: {
                questionId: createdQuestion.id,
                sortKey: option.sortKey,
                statementLatex: option.statementLatex,
                solutionLatex: option.solutionLatex,
                originalLatex: option.originalLatex,
                isCorrect: option.isCorrect,
                weight: option.weight,
                legacyId: option.legacyId,
                legacyMarcacao: option.legacyMarcacao,
              },
              select: { id: true },
            });
            idOf.set(option.id, createdOption.id);
            options += 1;
          }

          for (const name of question.tags) {
            const tagId = tagIdByName.get(name);
            if (tagId === undefined) continue;
            await client.questionTag.create({ data: { questionId: createdQuestion.id, tagId } });
          }

          // A figura da questão é da questão, e o livro é o contexto: `publicationId` junto.
          for (const asset of question.assets) {
            const id = await record(asset, {
              publicationId: createdPublication.id,
              questionId: createdQuestion.id,
            });
            if (id !== null && !assetIdBySha.has(asset.sha256)) assetIdBySha.set(asset.sha256, id);
          }
        }

        const createdNode = await client.documentNode.create({
          data: {
            publicationId: createdPublication.id,
            kind: node.kind,
            title: node.title,
            slug: node.slug,
            sortKey: node.sortKey,
            numberingStyle: node.numberingStyle,
            originalLabel: node.originalLabel,
            legacyId: node.legacyId,
            bodyLatex: node.bodyLatex,
            deletedAt: date(node.deletedAt),
            questionId,
          },
          select: { id: true },
        });

        nodeIdByRef.set(node.id, createdNode.id);
        idOf.set(node.id, createdNode.id);
        if (questionId !== null) questionIdByNode.set(node.id, questionId);
        nodes += 1;
      }

      const pointer = (sha256: string | null): string | null => {
        if (sha256 === null) return null;
        const id = assetIdBySha.get(sha256);
        if (id === undefined) missingAssets.add(sha256);
        return id ?? null;
      };

      const coverAssetId = pointer(publication.coverAssetSha256);
      const sourcePdfAssetId = pointer(publication.sourcePdfAssetSha256);
      if (coverAssetId !== null || sourcePdfAssetId !== null) {
        await client.publication.update({
          where: { id: createdPublication.id },
          data: { coverAssetId, sourcePdfAssetId },
        });
      }

      for (const node of publication.nodes) {
        if (node.parentId === null) continue;

        const id = nodeIdByRef.get(node.id);
        const parentId = nodeIdByRef.get(node.parentId);
        if (id === undefined || parentId === undefined) continue;

        await client.documentNode.update({ where: { id }, data: { parentId } });
      }

      // As âncoras renascem em ordem; a primeira responde pela coluna antiga do nó e da questão.
      for (const node of publication.nodes) {
        const nodeId = nodeIdByRef.get(node.id);
        if (nodeId === undefined) continue;

        let order = 0;
        let primary: string | null = null;
        for (const anchor of node.anchors) {
          const sourceAssetId = pointer(anchor.sha256);
          if (sourceAssetId === null) continue;
          const createdAnchor = await client.sourceAnchor.create({
            data: {
              publicationId: createdPublication.id,
              sourceAssetId,
              cropAssetId: pointer(anchor.cropSha256),
              pageNumber: anchor.pageNumber,
              xNormalized: anchor.box.x,
              yNormalized: anchor.box.y,
              widthNormalized: anchor.box.width,
              heightNormalized: anchor.box.height,
              rotation: anchor.rotation,
              sourceText: anchor.sourceText,
              extractionMethod: anchor.extractionMethod,
              extractionModel: anchor.extractionModel,
              metadataJson: anchor.metadataJson,
            },
            select: { id: true },
          });
          await client.documentNodeAnchor.create({
            data: {
              documentNodeId: nodeId,
              sourceAnchorId: createdAnchor.id,
              sortOrder: order++,
              role: anchor.role,
            },
          });
          primary ??= createdAnchor.id;
        }
        if (primary) {
          await client.documentNode.update({ where: { id: nodeId }, data: { sourceAnchorId: primary } });
          const questionId = questionIdByNode.get(node.id);
          if (questionId) {
            await client.question.update({ where: { id: questionId }, data: { sourceAnchorId: primary } });
          }
        }
      }
    }

    for (const template of plan.workspace.templates) {
      await client.documentTemplate.create({ data: { workspaceId: workspace.id, ...template } });
    }

    // As avaliações e o gabarito de cada variante. Um item que cita questão fora do arquivo
    // não tem para onde apontar — o export já não o leva, e aqui é só a rede.
    for (const assessment of plan.workspace.assessments) {
      const createdAssessment = await client.assessment.create({
        data: {
          workspaceId: workspace.id,
          title: assessment.title,
          subtitle: assessment.subtitle,
          notes: assessment.notes,
        },
        select: { id: true },
      });

      for (const section of assessment.sections) {
        const createdSection = await client.assessmentSection.create({
          data: { assessmentId: createdAssessment.id, title: section.title, sortKey: section.sortKey },
          select: { id: true },
        });
        for (const item of section.items) {
          const questionId = idOf.get(item.questionId);
          if (questionId === undefined) continue;
          await client.assessmentItem.create({
            data: {
              sectionId: createdSection.id,
              questionId,
              sortKey: item.sortKey,
              points: item.points,
              pinnedLastOptionIdsJson: JSON.stringify(
                item.pinnedLastOptionIds.flatMap((id) => idOf.get(id) ?? []),
              ),
            },
          });
        }
      }

      for (const variant of assessment.variants) {
        const createdVariant = await client.assessmentVariant.create({
          data: {
            assessmentId: createdAssessment.id,
            label: variant.label,
            seed: variant.seed,
            shuffleQuestions: variant.shuffleQuestions,
            shuffleOptions: variant.shuffleOptions,
            createdAt: new Date(variant.createdAt),
          },
          select: { id: true },
        });
        for (const entry of variant.questions) {
          const questionId = idOf.get(entry.questionId);
          if (questionId === undefined) continue;
          await client.assessmentVariantQuestion.create({
            data: {
              variantId: createdVariant.id,
              questionId,
              position: entry.position,
              options: {
                create: entry.options.flatMap((option) => {
                  const optionId = idOf.get(option.optionId);
                  return optionId === undefined
                    ? []
                    : [{ optionId, displayedLabel: option.displayedLabel, position: option.position }];
                }),
              },
            },
          });
        }
      }
    }

    // O histórico, com o snapshot apontando para as alternativas deste banco.
    for (const revision of plan.workspace.revisions) {
      const entityId = idOf.get(revision.entityId);
      if (entityId === undefined) continue;
      await client.revision.create({
        data: {
          entityType: revision.entityType,
          entityId,
          revisionNumber: revision.revisionNumber,
          origin: revision.origin,
          summary: revision.summary,
          snapshotJson: translateSnapshotIds(revision.snapshotJson, (id) => idOf.get(id)),
          createdAt: new Date(revision.createdAt),
        },
      });
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
  }, RESTORE_TRANSACTION);
}

/**
 * O prazo da transação: o padrão do Prisma é 5 s, e restaurar uma biblioteca de mil questões com
 * figuras passa disso com folga — o backup falharia justamente no acervo que mais importa. Dez
 * minutos é o teto de "algo travou", não a duração esperada.
 */
const RESTORE_TRANSACTION = { timeout: 600_000, maxWait: 10_000 } as const;

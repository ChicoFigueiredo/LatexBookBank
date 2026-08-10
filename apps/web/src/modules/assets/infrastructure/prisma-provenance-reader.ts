import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import type { Provenance, ProvenanceReader } from "@modules/assets/domain/provenance";

/**
 * Leitura da cadeia de proveniência a partir da questão.
 *
 * A projeção acontece **aqui**, na fronteira: o que sai é o DTO do domínio, sem `storageKey` e
 * sem `xNormalized`. A tela pede os bytes por `assetId`, e quem resolve a chave é o servidor.
 *
 * Ver spec §18 · D26 · issue #137.
 */
export class PrismaProvenanceReader implements ProvenanceReader {
  async findByQuestionId(questionId: string): Promise<Provenance | null> {
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      select: {
        sourceAnchor: {
          select: {
            id: true,
            publicationId: true,
            pageNumber: true,
            xNormalized: true,
            yNormalized: true,
            widthNormalized: true,
            heightNormalized: true,
            rotation: true,
            cropAssetId: true,
            sourceText: true,
            extractionMethod: true,
            extractionModel: true,
            sourceAsset: {
              select: { id: true, originalFilename: true, mimeType: true },
            },
          },
        },
      },
    });

    const anchor = question?.sourceAnchor;
    if (anchor === undefined || anchor === null) return null;

    return {
      anchorId: anchor.id,
      publicationId: anchor.publicationId,
      pageNumber: anchor.pageNumber,
      box: {
        x: anchor.xNormalized,
        y: anchor.yNormalized,
        width: anchor.widthNormalized,
        height: anchor.heightNormalized,
      },
      rotation: anchor.rotation,
      source: {
        assetId: anchor.sourceAsset.id,
        filename: anchor.sourceAsset.originalFilename,
        mimeType: anchor.sourceAsset.mimeType,
        isPdf: anchor.sourceAsset.mimeType === "application/pdf",
      },
      cropAssetId: anchor.cropAssetId,
      sourceText: anchor.sourceText,
      extractionMethod: anchor.extractionMethod,
      extractionModel: anchor.extractionModel,
    };
  }
}

/** Só o que a rota de conteúdo precisa: a chave e o tipo, resolvidos no servidor. */
export async function findAssetContentRef(
  assetId: string,
): Promise<{ storageKey: string; mimeType: string; filename: string | null } | null> {
  return prisma.asset
    .findUnique({
      where: { id: assetId },
      select: { storageKey: true, mimeType: true, originalFilename: true },
    })
    .then((row) =>
      row === null
        ? null
        : { storageKey: row.storageKey, mimeType: row.mimeType, filename: row.originalFilename },
    );
}

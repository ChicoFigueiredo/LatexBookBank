import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import type { StoredAssetRecord } from "@modules/assets/application/store-asset";
import type { NormalizedBox } from "@modules/assets/domain/source-anchor";

/**
 * Escrita de assets e de âncoras.
 *
 * **A fonte é imutável e nunca é substituída** (D29). Não existe função de `update` aqui: um
 * arquivo alterado vira um asset novo, porque a `storageKey` contém o hash do conteúdo. Um crop,
 * um OCR ou um texto extraído são registros **adicionais** que apontam para a fonte — nunca
 * escrita por cima dela.
 *
 * Ver spec §10 · D28 · D29 · issue #123.
 */

export interface CreateAssetInput extends StoredAssetRecord {
  readonly workspaceId: string;
  readonly questionId?: string | null;
  readonly publicationId?: string | null;
}

export async function createAsset(input: CreateAssetInput): Promise<{ id: string }> {
  // O mesmo conteúdo já subido devolve o asset existente. A `storageKey` é `@unique` e contém o
  // hash — insistir em criar daria erro de constraint por uma situação que é o caso comum:
  // a mesma figura usada em duas questões.
  const existing = await prisma.asset.findUnique({
    where: { storageKey: input.storageKey },
    select: { id: true },
  });
  if (existing) return existing;

  return prisma.asset.create({
    data: {
      workspaceId: input.workspaceId,
      questionId: input.questionId ?? null,
      publicationId: input.publicationId ?? null,
      kind: input.kind,
      storageKey: input.storageKey,
      mimeType: input.mimeType,
      originalFilename: input.originalFilename,
      sha256: input.sha256,
      sizeBytes: input.sizeBytes,
      width: input.width,
      height: input.height,
    },
    select: { id: true },
  });
}

export interface CreateAnchorInput {
  readonly publicationId: string;
  readonly sourceAssetId: string;
  readonly pageNumber: number;
  readonly box: NormalizedBox;
  readonly rotation: number | null;
  readonly cropAssetId: string | null;
  readonly sourceText?: string | null;
  readonly extractionMethod?: string | null;
  readonly extractionModel?: string | null;
}

export async function createAnchor(input: CreateAnchorInput): Promise<{ id: string }> {
  return prisma.sourceAnchor.create({
    data: {
      publicationId: input.publicationId,
      sourceAssetId: input.sourceAssetId,
      pageNumber: input.pageNumber,
      // Normalizadas, sempre. A coluna não guarda pixel (D28).
      xNormalized: input.box.x,
      yNormalized: input.box.y,
      widthNormalized: input.box.width,
      heightNormalized: input.box.height,
      rotation: input.rotation,
      cropAssetId: input.cropAssetId,
      sourceText: input.sourceText ?? null,
      extractionMethod: input.extractionMethod ?? null,
      extractionModel: input.extractionModel ?? null,
    },
    select: { id: true },
  });
}

/** Liga a questão à âncora. É o que faz "voltar à origem" funcionar a partir dela. */
export async function attachAnchorToQuestion(
  questionId: string,
  sourceAnchorId: string,
): Promise<void> {
  await prisma.question.update({ where: { id: questionId }, data: { sourceAnchorId } });
}

export interface SourceAssetRef {
  readonly id: string;
  readonly kind: string;
  readonly originalFilename: string | null;
  readonly workspaceId: string;
}

export async function findAsset(assetId: string): Promise<SourceAssetRef | null> {
  return prisma.asset.findUnique({
    where: { id: assetId },
    select: { id: true, kind: true, originalFilename: true, workspaceId: true },
  });
}

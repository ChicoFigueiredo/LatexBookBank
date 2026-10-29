import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import { inChunks } from "@infrastructure/database/sqlite/in-chunks";

import { DERIVED_ASSET_KINDS } from "../domain/asset-kind";

/**
 * Os assets **com dono**: a leitura e a gravação que a portabilidade (o `.lbb`) faz do acervo.
 *
 * O dono de um asset é a questão, quando há uma (`questionId`); senão, o livro (`publicationId`).
 * Uma figura de questão que também carrega `publicationId` é da questão — o livro é só o contexto
 * de onde ela veio. Um recorte avulso, sem nenhum dos dois, é de quem o cita (a âncora).
 *
 * **Uma linha por dono.** A mesma figura em duas questões são duas linhas apontando para o mesmo
 * arquivo no storage — é o que permite a cada questão achar a sua por `questionId`, e excluir uma
 * sem levar a figura da outra. A deduplicação é do **arquivo** (a `storageKey` é o hash), nunca da
 * linha.
 *
 * Quem grava e lê pela forma da tabela fica amarrado a ela; quem passa por aqui, não.
 */

/** O cliente Prisma, de fora ou de dentro de uma transação — os dois têm o mesmo `asset`. */
type AssetClient = Pick<typeof prisma, "asset">;

export interface OwnedAssetRow {
  readonly id: string;
  readonly sha256: string;
  readonly storageKey: string;
  readonly kind: string;
  readonly mimeType: string;
  readonly originalFilename: string | null;
  readonly sizeBytes: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly metadataJson: string | null;
  readonly publicationId: string | null;
  readonly questionId: string | null;
}

const SELECT = {
  id: true,
  sha256: true,
  storageKey: true,
  kind: true,
  mimeType: true,
  originalFilename: true,
  sizeBytes: true,
  width: true,
  height: true,
  metadataJson: true,
  publicationId: true,
  questionId: true,
} as const;

/**
 * Os assets **fonte** de uma biblioteca, mais os que ela cita por id e moram fora dela.
 *
 * Derivado de render nunca entra: é saída de compilação, reconstruível no destino (D29). Os ids
 * extras existem porque uma âncora, uma capa ou um PDF fonte podem apontar para uma linha de
 * outra biblioteca — dado antigo, de antes de o upload conferir o dono —, e o export não pode
 * deixar a âncora apontando para nada.
 */
export async function listSourceAssets(
  workspaceId: string,
  alsoIds: readonly string[] = [],
): Promise<readonly OwnedAssetRow[]> {
  const own = await prisma.asset.findMany({
    where: { workspaceId, renderJobId: null, kind: { notIn: [...DERIVED_ASSET_KINDS] } },
    select: SELECT,
  });

  const known = new Set(own.map((row) => row.id));
  const missing = [...new Set(alsoIds)].filter((id) => !known.has(id));
  const extra: OwnedAssetRow[] = [];
  for (const ids of inChunks(missing)) {
    extra.push(...(await prisma.asset.findMany({ where: { id: { in: ids } }, select: SELECT })));
  }

  return [...own, ...extra];
}

export interface OwnedAssetInput {
  readonly workspaceId: string;
  readonly publicationId: string | null;
  readonly questionId: string | null;
  readonly kind: string;
  readonly storageKey: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
  readonly originalFilename: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly metadataJson: string | null;
}

/**
 * Registra o arquivo para o dono, e devolve a linha.
 *
 * Reaproveita só a linha **do mesmo dono** com o mesmo arquivo e o mesmo tipo: gravar duas vezes
 * a mesma figura na mesma questão é uma figura só; a mesma figura em outra questão é outra linha.
 */
export async function recordOwnedAsset(
  client: AssetClient,
  input: OwnedAssetInput,
): Promise<{ readonly id: string }> {
  const existing = await client.asset.findFirst({
    where: {
      workspaceId: input.workspaceId,
      storageKey: input.storageKey,
      kind: input.kind,
      publicationId: input.publicationId,
      questionId: input.questionId,
      renderJobId: null,
    },
    select: { id: true },
  });
  if (existing) return existing;

  return client.asset.create({
    data: {
      workspaceId: input.workspaceId,
      publicationId: input.publicationId,
      questionId: input.questionId,
      kind: input.kind,
      storageKey: input.storageKey,
      mimeType: input.mimeType,
      originalFilename: input.originalFilename,
      sha256: input.sha256,
      sizeBytes: input.sizeBytes,
      width: input.width,
      height: input.height,
      metadataJson: input.metadataJson,
    },
    select: { id: true },
  });
}

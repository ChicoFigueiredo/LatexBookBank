import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import type { CitedFigure } from "@modules/assets/application/figure-preview";
import { assetLatexName } from "@modules/assets/domain/asset-latex-name";
import { isAssetKind, isSourceAsset } from "@modules/assets/domain/asset-kind";

/**
 * O asset que um nome de `\includegraphics` cita, no acervo de uma publicação.
 *
 * Procura pelo começo do sha256 — que o nome carrega —, no workspace da publicação, e confere o
 * nome inteiro, como `citedAssets` faz na hora de compilar: o mesmo nome leva à mesma figura no
 * preview e no PDF. Derivado de render não entra (é saída, não figura).
 */
export async function findCitedFigure(
  publicationId: string,
  name: string,
  hash: string,
): Promise<CitedFigure | null> {
  const publication = await prisma.publication.findUnique({
    where: { id: publicationId },
    select: { workspaceId: true },
  });
  if (publication === null) return null;

  const rows = await prisma.asset.findMany({
    where: {
      workspaceId: publication.workspaceId,
      renderJobId: null,
      sha256: { startsWith: hash },
    },
    select: { storageKey: true, mimeType: true, sha256: true, originalFilename: true, kind: true },
  });
  const row = rows.find(
    (candidate) =>
      isAssetKind(candidate.kind) &&
      isSourceAsset(candidate.kind) &&
      assetLatexName(candidate) === name,
  );
  return row ? { storageKey: row.storageKey, mimeType: row.mimeType, sha256: row.sha256 } : null;
}

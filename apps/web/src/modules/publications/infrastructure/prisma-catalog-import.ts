import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import { LocalFileStorageProvider } from "@infrastructure/storage/local/local-file-storage-provider";
import { storeAsset } from "@modules/assets/application/store-asset";
import { createAsset } from "@modules/assets/infrastructure/prisma-asset-writer";
import type {
  CatalogAssetWriter,
  PublicationOriginWriter,
} from "@modules/publications/application/import-from-catalog";
import type { ExistingPublication } from "@modules/publications/domain/catalog-import";
import { env as appEnv } from "@/shared/config/env";

/**
 * Os dois lados de escrita da importação de catálogo, e a leitura que a duplicata precisa.
 *
 * Nada aqui decide regra: o domínio já escolheu o que copiar e o caso de uso já sabe se é
 * duplicata. O que estes adaptadores fazem é gravar o que foi decidido.
 */

/** Copia o arquivo do catálogo para o storage gerenciado e registra o `Asset`. */
export class PrismaCatalogAssetWriter implements CatalogAssetWriter {
  async store(
    input: Parameters<CatalogAssetWriter["store"]>[0],
  ): Promise<{ readonly id: string }> {
    const stored = await storeAsset(
      {
        workspaceId: input.workspaceId,
        filename: input.filename,
        mimeType: input.mimeType,
        content: input.content,
        kind: input.kind,
      },
      new LocalFileStorageProvider({ rootDir: appEnv().storageRoot }),
    );

    return createAsset({
      ...stored,
      workspaceId: input.workspaceId,
      ...(input.publicationId ? { publicationId: input.publicationId } : {}),
    });
  }
}

/** Liga capa, fonte e a origem do catálogo à publicação. */
export class PrismaPublicationOriginWriter implements PublicationOriginWriter {
  async attachOrigin(
    publicationId: string,
    input: Parameters<PublicationOriginWriter["attachOrigin"]>[1],
  ): Promise<void> {
    await prisma.publication.update({
      where: { id: publicationId },
      data: {
        coverAssetId: input.coverAssetId,
        sourcePdfAssetId: input.sourcePdfAssetId,
        metadataJson: input.metadataJson,
        importedAt: input.importedAt,
      },
    });
  }
}

/**
 * As publicações da biblioteca, como a checagem de duplicata as vê.
 *
 * O `externalId` sai de `metadataJson` — é onde a origem do catálogo fica guardada. Ler o JSON
 * aqui, e não no domínio, é o que mantém o formato de serialização como assunto da infraestrutura:
 * o domínio recebe `externalId: string | null` e não sabe de onde veio.
 */
export async function existingPublicationsOf(
  libraryId: string,
): Promise<readonly ExistingPublication[]> {
  const rows = await prisma.publication.findMany({
    where: { workspaceId: libraryId },
    select: {
      id: true,
      title: true,
      isbn: true,
      metadataJson: true,
      authors: { orderBy: { position: "asc" }, select: { author: { select: { name: true } } } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    isbn: row.isbn,
    authors: row.authors.map((link) => link.author.name),
    externalId: externalIdOf(row.metadataJson),
  }));
}

/** JSON corrompido vira `null`: um metadado ilegível não pode derrubar a tela do catálogo. */
function externalIdOf(metadataJson: string | null): string | null {
  if (metadataJson === null) return null;

  try {
    const parsed: unknown = JSON.parse(metadataJson);
    if (typeof parsed !== "object" || parsed === null) return null;

    const value = (parsed as Record<string, unknown>)["externalId"];
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

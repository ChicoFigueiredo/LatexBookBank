import { NextResponse } from "next/server";

import { findAssetContentRef } from "@modules/assets/infrastructure/prisma-provenance-reader";
import { LocalFileStorageProvider } from "@infrastructure/storage/local/local-file-storage-provider";
import { env as appEnv } from "@/shared/config/env";
import { asStorageKey, AssetNotFoundError } from "@/shared/ports";

/**
 * Serve os bytes de um asset.
 *
 * A `storageKey` **não** sai para o cliente (D26): ela é opaca e do servidor, e devolvê-la
 * contaria como o storage organiza os arquivos. O cliente pede por `assetId` e a resolução
 * acontece aqui — que é também o que impede alguém de baixar arquivo adivinhando caminho.
 *
 * O conteúdo é imutável por construção: a `storageKey` contém o sha256, então bytes diferentes
 * são outro asset (D29). Daí o cache agressivo — mas `private`, porque o arquivo pertence a um
 * workspace e um proxy compartilhado não tem o que fazer com ele.
 *
 * O que esta rota **não** faz é autorizar. Ela resolve por `assetId`, como a de artefatos de
 * render — quem tem o id chega aos bytes. Isso é o mesmo buraco que o guarda central de
 * autorização ainda aberto no checklist vai fechar, e escondê-lo atrás de uma checagem improvisada
 * aqui daria a impressão de que está resolvido em toda a aplicação.
 *
 * Ver spec §18 · D26 · D29 · issue #137.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;

  const asset = await findAssetContentRef(assetId);
  if (asset === null) {
    return NextResponse.json(
      { error: "not_found", message: "Este asset não existe." },
      { status: 404 },
    );
  }

  try {
    const stored = await new LocalFileStorageProvider({
      rootDir: appEnv().storageRoot,
    }).get(asStorageKey(asset.storageKey));

    return new Response(new Uint8Array(stored.content), {
      headers: {
        "content-type": stored.mimeType,
        "content-length": String(stored.sizeBytes),
        "cache-control": "private, max-age=31536000, immutable",
        "content-disposition": `inline; filename="${encodeURIComponent(asset.filename ?? assetId)}"`,
      },
    });
  } catch (error) {
    if (error instanceof AssetNotFoundError) {
      // Linha no banco sem arquivo no storage. Para um derivado isso é legítimo (D29), e a
      // resposta certa é 404 com a razão — não 500 opaco.
      return NextResponse.json(
        {
          error: "asset_evicted",
          message: "O arquivo não está mais no storage.",
        },
        { status: 404 },
      );
    }
    throw error;
  }
}

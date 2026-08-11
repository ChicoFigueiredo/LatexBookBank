import { NextResponse } from "next/server";

import { findRenderArtifact } from "@modules/rendering/infrastructure/prisma-render-job-repository";
import { LocalFileStorageProvider } from "@infrastructure/storage/local/local-file-storage-provider";
import { env as appEnv } from "@/shared/config/env";
import { asStorageKey, AssetNotFoundError } from "@/shared/ports";

/**
 * Baixa um artefato de render.
 *
 * A `storageKey` **não** sai para o cliente. Ela é opaca e do servidor; devolvê-la contaria como o
 * storage organiza os arquivos e amarraria o browser a um detalhe que muda quando o provider
 * mudar (D26). O cliente pede por `jobId` + nome, e a resolução acontece aqui.
 *
 * É também o que garante que ninguém baixe um artefato adivinhando caminho: a única forma de
 * chegar aos bytes é passar por um job que existe.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string; name: string }> },
) {
  const { jobId, name } = await params;

  const asset = await findRenderArtifact(jobId, name);

  if (asset === null) {
    return NextResponse.json(
      { error: "not_found", message: `Artefato \`${name}\` não existe no job ${jobId}.` },
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
        // Imutável: o conteúdo de um artefato nunca muda — mudar a entrada cria outro job. É o
        // mesmo raciocínio que faz o `contentHash` servir de cache, aplicado ao browser.
        "cache-control": "private, max-age=31536000, immutable",
        // `inline` e não `attachment`: o PDF é para ser visto na aba, não baixado.
        "content-disposition": `inline; filename="${encodeURIComponent(name)}"`,
      },
    });
  } catch (error) {
    if (error instanceof AssetNotFoundError) {
      // Linha no banco sem arquivo no storage: derivado pode ser descartado (D29), então isto é
      // um estado legítimo — e a resposta certa é 404 com a razão, não 500.
      return NextResponse.json(
        {
          error: "artifact_evicted",
          message: "O artefato foi descartado do storage. Recompile para gerá-lo de novo.",
        },
        { status: 404 },
      );
    }
    throw error;
  }
}

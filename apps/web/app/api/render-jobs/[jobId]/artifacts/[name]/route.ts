import { findRenderArtifact } from "@modules/rendering/infrastructure/prisma-render-job-repository";
import { storage } from "@infrastructure/composition";
import { servedContentHeaders } from "@/shared/http/served-content";
import { asStorageKey, AssetNotFoundError } from "@/shared/ports";

import { withErrors } from "../../../../http";
import { ArtifactEvictedError } from "@modules/rendering/domain/artifact-evicted";
import { RenderArtifactNotFoundError } from "@modules/rendering/domain/render-artifact-not-found";

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

export const GET = withErrors(async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string; name: string }> },
) {
  const { jobId, name } = await params;

  const asset = await findRenderArtifact(jobId, name);

  if (asset === null) throw new RenderArtifactNotFoundError(jobId, name);

  const stored = await storage()
    .get(asStorageKey(asset.storageKey))
    .catch((error: unknown) => {
      throw error instanceof AssetNotFoundError ? new ArtifactEvictedError() : error;
    });

  // Imutável: o conteúdo de um artefato nunca muda — mudar a entrada cria outro job. `inline` e
  // não `attachment`: o PDF é para ser visto na aba, não baixado. E o SVG da página vai em
  // sandbox, com `nosniff` em tudo: ele sai do LaTeX de quem escreveu, e aberto numa aba não
  // pode rodar como o app (#257).
  return new Response(new Uint8Array(stored.content), {
    headers: servedContentHeaders({
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      filename: name,
    }),
  });
});

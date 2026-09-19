import { notFound } from "next/navigation";

import { env } from "@/shared/config/env";
import { describeAiSetup } from "@modules/agents/application/describe-ai-setup";
import { fraseDaLocalidade, localidadeDaIa } from "@modules/agents/domain/ai-locality";
import { readBookSource } from "@modules/assets/infrastructure/prisma-book-source";
import { PrismaPublicationRepository } from "@modules/publications/infrastructure/prisma-publication-repository";
import { registeredCaptureProfiles } from "@modules/scan/domain/profiles";
import { scanDeps } from "@modules/scan/infrastructure/scan-deps";
import { PrismaLibraryRepository } from "@modules/workspaces/infrastructure/prisma-library-repository";

import { scanRunDto } from "../../../api/scans/scan-dto";
import { ScanStartScreen } from "./scan-start-screen";

/**
 * O scan de um livro: escolher o perfil e o intervalo, e ver as execuções que já existem (D45).
 *
 * O perfil sugerido é o que o livro lembra (D41); sem lembrança, o de livro-texto.
 */
export const dynamic = "force-dynamic";

export default async function ScanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  // Quem acaba de apagar uma importação chega aqui; o aviso é o recibo do que aconteceu (D57).
  const { importacao } = await searchParams;
  const repository = new PrismaPublicationRepository();
  const publication = await repository.findById(id);
  if (!publication) notFound();

  const detail = await repository.findDetailById(id);
  const source = await readBookSource(detail?.sourcePdfAssetId ?? null);
  const library = await new PrismaLibraryRepository().findById(publication.workspaceId);
  const { store, runner, sources } = scanDeps();
  const runs = await store.listRuns(id);
  const remembered = await sources.rememberedProfile(id);

  const appEnv = env();
  const ai = describeAiSetup();

  return (
    <ScanStartScreen
      publicationId={publication.id}
      title={publication.title}
      {...(library ? { library: { name: library.name, slug: library.slug } } : {})}
      source={source ? { filename: source.filename } : null}
      profiles={registeredCaptureProfiles().map((profile) => ({
        id: profile.id,
        label: profile.label,
        description: profile.description,
        version: profile.version,
      }))}
      suggestedProfile={remembered ?? "book-v1"}
      runs={runs.map((run) => scanRunDto(run, runner.isRunning(run.id)))}
      aiConfigured={appEnv.aiBaseUrl !== null && appEnv.aiModel !== null}
      visionConfigured={appEnv.aiBaseUrl !== null && Boolean(process.env["AI_VISION_MODEL"])}
      aviso={fraseDaLocalidade(localidadeDaIa(appEnv.aiBaseUrl), ai?.providerLabel ?? null)}
      importRemoved={importacao === "apagada"}
    />
  );
}

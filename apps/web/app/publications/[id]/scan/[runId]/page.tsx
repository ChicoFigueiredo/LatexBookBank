import { notFound } from "next/navigation";

import { env } from "@/shared/config/env";
import { getPublicationTree } from "@modules/document-tree/application/get-publication-tree";
import { PrismaDocumentTreeRepository } from "@modules/document-tree/infrastructure/prisma-document-tree-repository";
import { isContainerKind } from "@modules/document-tree/domain/add-placement";
import { PrismaPublicationRepository } from "@modules/publications/infrastructure/prisma-publication-repository";
import { getScan, ScanRunNotFoundError } from "@modules/scan/application/control-scan";
import { captureProfile, registeredCaptureProfiles } from "@modules/scan/domain/profiles";
import { scanDeps } from "@modules/scan/infrastructure/scan-deps";
import { PrismaLibraryRepository } from "@modules/workspaces/infrastructure/prisma-library-repository";

import { scanRunDto } from "../../../../api/scans/scan-dto";
import { ScanRunScreen } from "./scan-run-screen";

/** A revisão de uma execução de scan (D47). */
export const dynamic = "force-dynamic";

export default async function ScanRunPage({ params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await params;
  const publication = await new PrismaPublicationRepository().findById(id);
  if (!publication) notFound();

  const { store, runner } = scanDeps();
  const view = await getScan({ store, runner }, runId).catch((error: unknown) => {
    if (error instanceof ScanRunNotFoundError) return null;
    throw error;
  });
  if (!view || view.run.publicationId !== id) notFound();

  /*
    O perfil pode ter saído do código desde a varredura (ADR 0008).

    Sem o retrato, a tela abria com rótulo cru e `kinds` vazio: os seletores de tipo vinham em
    branco e cada clique voltava 409, sem nada explicando. O retrato devolve rótulo e tipos, e o
    `profileMissing` é o que a tela usa para dizer a verdade antes do primeiro clique.
  */
  const profile = captureProfile(view.run.profileId);
  const snapshot = view.run.profileSnapshot;
  const nodes = await getPublicationTree(new PrismaDocumentTreeRepository(), id);
  const library = await new PrismaLibraryRepository().findById(publication.workspaceId);
  const appEnv = env();

  return (
    <ScanRunScreen
      publicationId={id}
      title={publication.title}
      {...(library ? { library: { name: library.name, slug: library.slug } } : {})}
      runId={runId}
      fileUrl={`/api/assets/${view.run.sourceAssetId}/content`}
      profileLabel={profile?.label ?? snapshot?.label ?? view.run.profileId}
      kinds={profile?.kinds ?? snapshot?.kinds ?? []}
      profileMissing={profile === null ? view.run.profileId : null}
      profiles={registeredCaptureProfiles().map((entry) => ({ id: entry.id, label: entry.label }))}
      destinations={nodes
        .filter((node) => isContainerKind(node.kind))
        .map((node) => ({ id: node.id, title: node.title, depth: node.depth }))}
      aiAvailable={appEnv.aiBaseUrl !== null && appEnv.aiModel !== null}
      mathAvailable={appEnv.aiBaseUrl !== null && Boolean(process.env["AI_VISION_MODEL"])}
      initial={{ run: scanRunDto(view.run, view.running, view.interrupted), items: view.items }}
    />
  );
}

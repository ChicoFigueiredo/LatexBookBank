import { notFound } from "next/navigation";

import { PrismaPublicationRepository } from "@modules/publications/infrastructure/prisma-publication-repository";

import { IngestionScreen } from "./ingestion-screen";

/**
 * A tela de ingestão de uma publicação: subir → recortar → reconhecer → revisar.
 *
 * Server Component só para resolver o `workspaceId`. Ele não vem do cliente de propósito: a chave
 * de storage é prefixada por ele, e aceitar o valor que o navegador mandar seria aceitar que o
 * navegador escolha em qual workspace gravar.
 *
 * Ver spec §10 · §18 · §19 · issue #135.
 */

export const dynamic = "force-dynamic";

export default async function IngestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const publication = await new PrismaPublicationRepository().findById(id);
  if (!publication) notFound();

  return (
    <IngestionScreen
      publicationId={publication.id}
      workspaceId={publication.workspaceId}
      title={publication.title}
    />
  );
}

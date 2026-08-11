import { notFound } from "next/navigation";

import { getPublicationTree } from "@modules/document-tree/application/get-publication-tree";
import { PrismaDocumentTreeRepository } from "@modules/document-tree/infrastructure/prisma-document-tree-repository";
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

  // A árvore vem junto porque o destino se escolhe **na revisão** (design §14), e escolher exige
  // ver os capítulos e grupos que existem.
  const nodes = await getPublicationTree(new PrismaDocumentTreeRepository(), publication.id);

  return (
    <IngestionScreen
      publicationId={publication.id}
      workspaceId={publication.workspaceId}
      title={publication.title}
      nodes={nodes.map((node) => ({
        id: node.id,
        title: node.title,
        kind: node.kind,
        depth: node.depth,
      }))}
    />
  );
}

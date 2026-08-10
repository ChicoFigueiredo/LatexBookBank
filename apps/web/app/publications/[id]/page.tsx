import { notFound } from "next/navigation";

import { describeAiSetup } from "@modules/agents/application/describe-ai-setup";
import { getPublicationTree } from "@modules/document-tree/application/get-publication-tree";
import { PrismaDocumentTreeRepository } from "@modules/document-tree/infrastructure/prisma-document-tree-repository";
import { PrismaPublicationRepository } from "@modules/publications/infrastructure/prisma-publication-repository";

import { PublicationWorkbench } from "./publication-workbench";

/**
 * Árvore de uma publicação dentro do workbench (D14).
 *
 * Server Component: o repository roda aqui e só DTO atravessa a fronteira para o cliente. O
 * `PublicationWorkbench` é o Client Component — ele monta as zonas, mas nunca vê Prisma.
 */

/** Dinâmica: o conteúdo muda a cada edição, e no build não há banco a consultar. */
export const dynamic = "force-dynamic";

export default async function PublicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const publication = await new PrismaPublicationRepository().findById(id);
  if (!publication) notFound();

  const nodes = await getPublicationTree(new PrismaDocumentTreeRepository(), id);

  return (
    <PublicationWorkbench
      publicationId={id}
      publicationTitle={publication.title}
      publisher={publication.publisher}
      nodes={nodes}
      // Resolvido aqui, no servidor: só os rótulos atravessam para o cliente, nunca a chave.
      ai={describeAiSetup()}
    />
  );
}

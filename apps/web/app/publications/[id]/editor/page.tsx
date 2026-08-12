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

export default async function PublicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { node } = await searchParams;

  const publication = await new PrismaPublicationRepository().findById(id);
  if (!publication) notFound();

  const nodes = await getPublicationTree(new PrismaDocumentTreeRepository(), id);

  return (
    <PublicationWorkbench
      publicationId={id}
      /**
       * O nó pedido pela URL, quando há um.
       *
       * É o que faz a busca global e o "Continuar" da Home chegarem à questão certa em vez de
       * abrirem o livro no que estava selecionado da última vez.
       */
      {...(typeof node === "string" ? { requestedNodeId: node } : {})}
      // Resolvido aqui, no servidor: a tag é por workspace, e aceitar o valor do navegador seria
      // deixá-lo criar tag na biblioteca dos outros.
      workspaceId={publication.workspaceId}
      publicationTitle={publication.title}
      publisher={publication.publisher}
      nodes={nodes}
      // Resolvido aqui, no servidor: só os rótulos atravessam para o cliente, nunca a chave.
      ai={describeAiSetup()}
    />
  );
}

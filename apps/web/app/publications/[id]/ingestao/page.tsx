import { notFound } from "next/navigation";

import { env } from "@/shared/config/env";

import { describeAiSetup } from "@modules/agents/application/describe-ai-setup";
import { fraseDaLocalidade, localidadeDaIa } from "@modules/agents/domain/ai-locality";
import { getPublicationTree } from "@modules/document-tree/application/get-publication-tree";
import { PrismaDocumentTreeRepository } from "@modules/document-tree/infrastructure/prisma-document-tree-repository";
import { PrismaPublicationRepository } from "@modules/publications/infrastructure/prisma-publication-repository";
import { PrismaLibraryRepository } from "@modules/workspaces/infrastructure/prisma-library-repository";

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

  // A biblioteca vem para o breadcrumb: a captura entrou no shell do produto, e um breadcrumb que
  // começa no livro deixa a estante fora do caminho de volta.
  const library = await new PrismaLibraryRepository().findById(publication.workspaceId);

  /**
   * Onde o reconhecimento acontece — resolvido aqui, no servidor.
   *
   * A `AI_BASE_URL` não atravessa para o cliente, e não deveria: o que ele precisa é da conclusão,
   * não do endereço. Mesma regra do `describeAiSetup`, que já manda rótulos e nunca a chave.
   */
  const ai = describeAiSetup();
  const aviso = fraseDaLocalidade(localidadeDaIa(env().aiBaseUrl), ai?.providerLabel ?? null);

  return (
    <IngestionScreen
      aviso={aviso}
      {...(library ? { library: { name: library.name, slug: library.slug } } : {})}
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

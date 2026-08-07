import { NextResponse } from "next/server";

import { getPublicationTree } from "@modules/document-tree/application/get-publication-tree";
import { PrismaDocumentTreeRepository } from "@modules/document-tree/infrastructure/prisma-document-tree-repository";
import { PrismaPublicationRepository } from "@modules/publications/infrastructure/prisma-publication-repository";

/**
 * Árvore de uma publicação.
 *
 * O Route Handler só traduz HTTP: valida o parâmetro, chama o use case e escolhe o status. Toda
 * a regra vive no domínio, e é lá que ela é testada — este arquivo não é lugar de `if` de
 * negócio.
 *
 * A página `/publications/[id]` **não** usa esta rota: sendo Server Component, ela chama o use
 * case direto e evita um ida-e-volta HTTP contra o próprio processo. A rota existe para o que
 * acontece depois da carga inicial — recarregar a árvore após um CRUD, e o `Ctrl+K` da Fase 12.
 */

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const publication = await new PrismaPublicationRepository().findById(id);
  if (!publication) {
    return NextResponse.json(
      { error: "not_found", message: `Publicação ${id} não existe.` },
      { status: 404 },
    );
  }

  const nodes = await getPublicationTree(new PrismaDocumentTreeRepository(), id);

  return NextResponse.json(
    { publicationId: id, title: publication.title, nodes },
    {
      // A árvore muda a cada edição. Um cache intermediário devolvendo a versão anterior faria o
      // usuário achar que o salvamento falhou.
      headers: { "Cache-Control": "no-store" },
    },
  );
}

import { NextResponse } from "next/server";

import { emptyGlobalTrash, readGlobalTrash } from "@modules/document-tree/infrastructure/prisma-global-trash";

import { toErrorResponse } from "../tree-http";

/**
 * A lixeira do acervo inteiro — ler e esvaziar.
 *
 * O `GET` existe para o diálogo de confirmação, que precisa dos números **no momento do clique** e
 * não os do carregamento da página: entre abrir a lixeira e mandar esvaziar, o usuário pode ter
 * restaurado metade dela em outra aba, e "apagar 8 objetos" mentiria.
 *
 * Restaurar continua em `POST /api/publications/:id/nodes/:nodeId/restore`: a regra do ancestral
 * excluído é por publicação e já mora lá. A tela global sabe de qual livro é cada item, então usa
 * o endpoint que existe em vez de duplicar a regra.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const trash = await readGlobalTrash();

    return NextResponse.json({
      itemCount: trash.itemCount,
      objectCount: trash.objectCount,
      footer: trash.footer,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Esvaziar — a única operação do produto que apaga de verdade.
 *
 * `DELETE` sem corpo e sem alvo: o alvo é "tudo o que está na lixeira", e deixar o cliente mandar
 * a lista seria deixá-lo apagar um nó que não está lá.
 */
export async function DELETE() {
  try {
    const apagado = await emptyGlobalTrash();
    return NextResponse.json({ deleted: apagado });
  } catch (error) {
    return toErrorResponse(error);
  }
}

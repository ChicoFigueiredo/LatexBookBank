import { NextResponse } from "next/server";

import { emptyTrash } from "@modules/document-tree/application/empty-trash";
import { PrismaTrashPurge, readGlobalTrash } from "@modules/document-tree/infrastructure/prisma-global-trash";
import { LocalFileStorageProvider } from "@infrastructure/storage/local/local-file-storage-provider";
import { env as appEnv } from "@/shared/config/env";

import { toErrorResponse } from "../http";

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
 *
 * `held` é o que ficou porque uma avaliação o usa (#258) — 200, e não 409: o resto saiu, e a tela
 * diz o que ficou e por qual prova.
 */
export async function DELETE() {
  try {
    const result = await emptyTrash(
      new PrismaTrashPurge(),
      new LocalFileStorageProvider({ rootDir: appEnv().storageRoot }),
    );
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

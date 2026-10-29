import { NextResponse } from "next/server";

import { listTrash } from "@modules/document-tree/application/list-trash";
import { PrismaDocumentTreeRepository } from "@modules/document-tree/infrastructure/prisma-document-tree-repository";

import { toErrorResponse } from "../../../http";

/**
 * A lixeira de uma publicação.
 *
 * `listDeleted` existia desde a Fase 2 — o `restoreNode` a usa para decidir se o ancestral
 * continua excluído —, e **nenhuma tela a alcançava**: dava para excluir e não dava para ver o que
 * foi excluído. A §33 pede o contrário, e a §49 chama isto pelo nome: endpoint pronto, jornada
 * inexistente.
 *
 * O que sai é o que a lixeira precisa mostrar. `restorable` é a regra que o `restoreNode` aplica,
 * e vem do caso de uso (`listTrash`), que usa a mesma função do domínio.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const items = await listTrash(new PrismaDocumentTreeRepository(), id);

    return NextResponse.json({
      items: items.map((item) => ({ ...item, deletedAt: item.deletedAt.toISOString() })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

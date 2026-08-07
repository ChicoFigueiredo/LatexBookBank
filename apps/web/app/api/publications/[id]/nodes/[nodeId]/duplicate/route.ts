import { NextResponse } from "next/server";

import { duplicateNode } from "@modules/document-tree/application/mutate-tree";
import { PrismaDocumentTreeRepository } from "@modules/document-tree/infrastructure/prisma-document-tree-repository";

import { parsePlacement, readJson, toErrorResponse } from "../../../../../tree-http";

/**
 * Duplica um nó e tudo abaixo dele.
 *
 * `POST` porque cria recursos — e mais de um: a resposta devolve só o id da nova raiz, que é por
 * onde o cliente navega. A subárvore inteira vem na próxima leitura da árvore.
 *
 * `placement` é obrigatório e não tem default. "Logo depois do original" parece o óbvio, mas
 * duplicar para dentro de outro capítulo é caso legítimo, e um default silencioso colocaria a
 * cópia longe de onde o usuário esperava sem ele ter pedido nada.
 */
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; nodeId: string }> },
) {
  const { id, nodeId } = await params;
  const repository = new PrismaDocumentTreeRepository();

  try {
    const body = await readJson(request);
    const newRootId = await duplicateNode(
      { reader: repository, writer: repository },
      id,
      nodeId,
      parsePlacement(body["placement"]),
    );

    return NextResponse.json({ id: newRootId }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

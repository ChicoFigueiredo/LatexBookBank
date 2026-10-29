import { NextResponse } from "next/server";

import { restoreNode } from "@modules/document-tree/application/mutate-tree";
import type { RestoreNodeResponse } from "@modules/document-tree/application/trash-contract";
import { PrismaDocumentTreeRepository } from "@modules/document-tree/infrastructure/prisma-document-tree-repository";

import { toErrorResponse } from "../../../../../http";

/**
 * Restaura um nó da lixeira.
 *
 * `POST` e não `PATCH` porque restaurar não é editar um campo: é uma operação com regra própria
 * — recusa se o ancestral continuar excluído — e com efeito sobre vários nós de uma vez.
 */
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; nodeId: string }> },
) {
  const { id, nodeId } = await params;
  const repository = new PrismaDocumentTreeRepository();

  try {
    const restored = await restoreNode({ reader: repository, writer: repository }, id, nodeId);
    return NextResponse.json({ restored } satisfies RestoreNodeResponse);
  } catch (error) {
    return toErrorResponse(error);
  }
}

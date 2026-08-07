import { NextResponse } from "next/server";

import { deleteNode, moveNode, renameNode } from "@modules/document-tree/application/mutate-tree";
import { PrismaDocumentTreeRepository } from "@modules/document-tree/infrastructure/prisma-document-tree-repository";

import {
  BadRequestError,
  parsePlacement,
  parseTitle,
  readJson,
  toErrorResponse,
} from "../../../../tree-http";

/**
 * Um nó dentro de uma publicação.
 *
 * A publicação fica **na URL**, não deduzida do id do nó. Além de ser a hierarquia honesta, é o
 * que impede editar um nó de outra publicação só por conhecer o id dele — a checagem de
 * pertencimento vira consequência da rota, não um `if` que alguém pode esquecer.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; nodeId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id, nodeId } = await params;
  const repository = new PrismaDocumentTreeRepository();
  const deps = { reader: repository, writer: repository };

  try {
    const body = await readJson(request);
    const hasTitle = "title" in body;
    const hasPlacement = "placement" in body;

    if (!hasTitle && !hasPlacement) {
      throw new BadRequestError("Informe `title`, `placement`, ou os dois.");
    }

    // Renomear antes de mover: se o movimento for recusado por ciclo, o nome novo já valeu e o
    // usuário não perde o que digitou junto com o gesto que falhou.
    if (hasTitle) await renameNode(deps, id, nodeId, parseTitle(body["title"]));
    if (hasPlacement) await moveNode(deps, id, nodeId, parsePlacement(body["placement"]));

    return NextResponse.json({ id: nodeId });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id, nodeId } = await params;
  const repository = new PrismaDocumentTreeRepository();

  try {
    const removed = await deleteNode({ reader: repository, writer: repository }, id, nodeId);
    // A lista devolvida não é enfeite: o cliente precisa saber que a exclusão levou a
    // descendência junto, para poder dizer isso ao usuário antes que ele descubra sozinho.
    return NextResponse.json({ deleted: removed });
  } catch (error) {
    return toErrorResponse(error);
  }
}

import { NextResponse } from "next/server";

import { createNode } from "@modules/document-tree/application/mutate-tree";
import { PrismaDocumentTreeRepository } from "@modules/document-tree/infrastructure/prisma-document-tree-repository";
import { PrismaPublicationRepository } from "@modules/publications/infrastructure/prisma-publication-repository";

import {
  parseNodeKind,
  parsePlacement,
  parseTitle,
  readJson,
  toErrorResponse,
} from "../../../tree-http";

/** Cria um nó na árvore de uma publicação. */
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const publication = await new PrismaPublicationRepository().findById(id);
  if (!publication) {
    return NextResponse.json(
      { error: "not_found", message: `Publicação ${id} não existe.` },
      { status: 404 },
    );
  }

  try {
    const body = await readJson(request);
    const repository = new PrismaDocumentTreeRepository();

    const nodeId = await createNode(
      { reader: repository, writer: repository },
      {
        publicationId: id,
        kind: parseNodeKind(body["kind"]),
        title: parseTitle(body["title"]),
        placement: parsePlacement(body["placement"]),
      },
    );

    return NextResponse.json({ id: nodeId }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

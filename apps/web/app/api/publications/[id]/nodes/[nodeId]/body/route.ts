import { NextResponse } from "next/server";

import { saveNodeBody } from "@modules/document-tree/application/save-node-body";
import { canHaveBody, InvalidNodeBodyError } from "@modules/document-tree/domain/node-body";
import { PrismaNodeBodyRepository } from "@modules/document-tree/infrastructure/prisma-node-body";
import { PrismaNodeAnchors } from "@modules/assets/infrastructure/prisma-node-anchors";
import { ConcurrencyConflictError } from "@/shared/ports/repository";

import { BadRequestError, readJson, toErrorResponse } from "../../../../../tree-http";

/**
 * O corpo de um nó estrutural (D42, ADR 0001): ler, com o histórico e as âncoras, e salvar com
 * concorrência otimista — a mesma moeda (`updatedAt`) que o editor da questão usa.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; nodeId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id, nodeId } = await params;
  try {
    const repository = new PrismaNodeBodyRepository();
    const record = await repository.find(id, nodeId);
    if (!record) {
      return NextResponse.json({ error: "not_found", message: "Nó não encontrado." }, { status: 404 });
    }
    const [revisions, anchors] = await Promise.all([
      repository.listRevisions(nodeId),
      new PrismaNodeAnchors().listForNode(nodeId),
    ]);

    return NextResponse.json({
      nodeId: record.nodeId,
      kind: record.kind,
      title: record.title,
      bodyLatex: record.bodyLatex,
      canHaveBody: canHaveBody(record.kind),
      version: record.updatedAt.toISOString(),
      anchors,
      revisions,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  const { id, nodeId } = await params;
  try {
    const body = await readJson(request);
    const expected = new Date(String(body["expectedVersion"] ?? ""));
    if (Number.isNaN(expected.getTime())) throw new BadRequestError("`expectedVersion` é obrigatório.");

    const { record, written } = await saveNodeBody(new PrismaNodeBodyRepository(), {
      publicationId: id,
      nodeId,
      expectedUpdatedAt: expected,
      bodyLatex: body["bodyLatex"],
    });

    return NextResponse.json({ version: record.updatedAt.toISOString(), written });
  } catch (error) {
    if (error instanceof ConcurrencyConflictError) {
      return NextResponse.json(
        {
          error: "conflict",
          message: "Este nó mudou desde que você abriu. Recarregue para ver a versão atual antes de salvar.",
          expectedVersion: String(error.expectedVersion),
          actualVersion: String(error.actualVersion),
        },
        { status: 409 },
      );
    }
    if (error instanceof InvalidNodeBodyError) {
      return NextResponse.json({ error: "bad_request", message: error.message }, { status: 400 });
    }
    return toErrorResponse(error);
  }
}

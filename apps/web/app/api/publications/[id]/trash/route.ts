import { NextResponse } from "next/server";

import { PrismaDocumentTreeRepository } from "@modules/document-tree/infrastructure/prisma-document-tree-repository";

import { toErrorResponse } from "../../../tree-http";

/**
 * A lixeira de uma publicação.
 *
 * `listDeleted` existia desde a Fase 2 — o `restoreNode` a usa para decidir se o ancestral
 * continua excluído —, e **nenhuma tela a alcançava**: dava para excluir e não dava para ver o que
 * foi excluído. A §33 pede o contrário, e a §49 chama isto pelo nome: endpoint pronto, jornada
 * inexistente.
 *
 * O que sai é o que a lixeira precisa mostrar. `restorable` responde a regra que o `restoreNode`
 * aplica: um nó cujo ancestral também está na lixeira não pode voltar sozinho — ele voltaria
 * apontando para um pai invisível, sumiria da árvore de novo, e o usuário concluiria que a
 * restauração falhou sem nada dizer.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const deleted = await new PrismaDocumentTreeRepository().listDeleted(id);
    const naLixeira = new Set(deleted.map((node) => node.id));

    return NextResponse.json({
      items: deleted.map((node) => ({
        id: node.id,
        title: node.title,
        kind: node.kind,
        deletedAt: node.deletedAt.toISOString(),
        restorable: node.parentId === null || !naLixeira.has(node.parentId),
      })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

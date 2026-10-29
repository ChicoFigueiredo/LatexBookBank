import type { DocumentTreeWriter } from "@modules/document-tree/domain/document-tree-repository";
import type { NodeKind } from "@modules/document-tree/domain/node-kind";
import { isRestorable } from "@modules/document-tree/domain/restoration";

/**
 * A lixeira de um livro, com o que pode voltar.
 *
 * `restorable` é a regra do `restoreNode`, aplicada antes do clique: um nó cujo ancestral também
 * está na lixeira não volta sozinho. Morava como `if` na rota (STE-11); aqui ela é a mesma função
 * que o restaurar usa.
 */

export interface TrashItem {
  readonly id: string;
  readonly title: string | null;
  readonly kind: NodeKind;
  readonly deletedAt: Date;
  readonly restorable: boolean;
}

export async function listTrash(
  writer: Pick<DocumentTreeWriter, "listDeleted">,
  publicationId: string,
): Promise<readonly TrashItem[]> {
  const deleted = await writer.listDeleted(publicationId);
  const naLixeira = new Set(deleted.map((node) => node.id));

  return deleted.map((node) => ({
    id: node.id,
    title: node.title,
    kind: node.kind,
    deletedAt: node.deletedAt,
    restorable: isRestorable(node, naLixeira),
  }));
}

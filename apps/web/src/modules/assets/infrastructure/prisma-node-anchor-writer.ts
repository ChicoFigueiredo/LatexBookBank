import type { Tx } from "@infrastructure/database/sqlite/transaction";
import type { NodeAnchorPlan } from "@modules/assets/domain/node-anchors";

/**
 * A escrita das âncoras de um nó, dentro de uma transação que já existe (D50, ADR 0003).
 *
 * A regra que esta função protege é a sincronia com a coluna antiga: `sourceAnchorId` do nó **e**
 * da questão que ele carrega apontam sempre para a âncora principal da lista, na mesma transação.
 * Enquanto a aba Origem, a fila de captura e o `.lbb` v1 lerem a coluna, uma lista que mudasse sem
 * ela faria a questão mostrar uma origem e o nó outra.
 *
 * Arquivo à parte de `prisma-node-anchors.ts`, e sem `server-only` nem o cliente do módulo: quem
 * cria nó em lote (o escritor de nó, que o importador legado usa pela linha de comando) chega aqui
 * com a transação dele, e importar o cliente faria o `server-only` abortar o script.
 */

/**
 * Reescreve a lista inteira dentro de uma transação que já existe.
 *
 * Os criadores (escritor de nó, aprovação do scan) já estão numa transação e não podem abrir
 * outra — no SQLite, uma transação aninhada espera a de fora e trava.
 */
export async function writeNodeAnchors(
  tx: Tx,
  nodeId: string,
  plan: NodeAnchorPlan,
): Promise<void> {
  await tx.documentNodeAnchor.deleteMany({ where: { documentNodeId: nodeId } });

  if (plan.anchors.length > 0) {
    await tx.documentNodeAnchor.createMany({
      data: plan.anchors.map((anchor) => ({
        documentNodeId: nodeId,
        sourceAnchorId: anchor.sourceAnchorId,
        sortOrder: anchor.sortOrder,
        role: anchor.role,
      })),
    });
  }

  // **`updatedAt` regravado com o mesmo valor**, no nó e na questão (#259). Ele é o token de
  // concorrência dos dois editores, e o `@updatedAt` do Prisma o avançaria aqui. A âncora é marcada
  // pelo *Ver fonte*, de dentro do editor aberto — que só conhece a versão do próprio salvamento —,
  // e o autosave seguinte batia em 409 sem que ninguém tivesse mexido no texto. Mesma decisão da
  // validação (#166): estado derivado não é versão nova.
  const node = await tx.documentNode.findUniqueOrThrow({
    where: { id: nodeId },
    select: { questionId: true, updatedAt: true, question: { select: { updatedAt: true } } },
  });

  await tx.documentNode.update({
    where: { id: nodeId },
    data: { sourceAnchorId: plan.primaryAnchorId, updatedAt: node.updatedAt },
  });

  if (node.questionId && node.question) {
    await tx.question.update({
      where: { id: node.questionId },
      data: { sourceAnchorId: plan.primaryAnchorId, updatedAt: node.question.updatedAt },
    });
  }
}

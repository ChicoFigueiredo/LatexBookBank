import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";

/**
 * Onde uma questão vive: qual publicação, qual nó.
 *
 * É o que transforma um resultado de busca em navegação. Sem isto, `questionId` é um identificador
 * que a UI não sabe abrir — e um resultado que não abre não deveria estar na lista.
 */

export interface QuestionLocation {
  readonly questionId: string;
  readonly nodeId: string;
  readonly publicationId: string;
}

export async function findQuestionLocation(questionId: string): Promise<QuestionLocation | null> {
  // Pelo **nó**, e não pela questão: uma questão sem nó não tem lugar na árvore, e navegar até ela
  // levaria a uma tela sem seleção possível. `deletedAt` fora porque a lixeira não é destino.
  const node = await prisma.documentNode.findFirst({
    where: { questionId, deletedAt: null },
    select: { id: true, publicationId: true },
  });

  return node ? { questionId, nodeId: node.id, publicationId: node.publicationId } : null;
}

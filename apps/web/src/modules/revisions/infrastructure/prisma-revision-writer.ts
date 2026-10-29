import type { Prisma } from "@/generated/prisma/client";
import type { NewRevision } from "@modules/revisions/domain/revision";

/**
 * Grava uma revisão com o número seguinte da entidade, dentro de uma transação que já existe.
 *
 * O **único** lugar que numera revisão (ARQ-04). Antes, o salvamento do corpo do nó, a aprovação
 * do scan, a retirada de uma importação e o aplicador de patch contavam cada um o seu
 * `revisionNumber + 1`; uma mudança na regra (um retry na corrida do `@@unique`, outro formato)
 * teria de ser achada em quatro módulos.
 *
 * O número é contado **dentro** da transação de quem muda a entidade: dois gravadores ao mesmo
 * tempo não chegam ao mesmo número, e a `@@unique([entityType, entityId, revisionNumber])` faria o
 * segundo falhar em vez de sobrescrever.
 *
 * Sem `server-only` e sem o cliente do módulo: quem chama traz a transação.
 */
export async function appendRevision(
  tx: Prisma.TransactionClient,
  revision: NewRevision,
): Promise<number> {
  const last = await tx.revision.findFirst({
    where: { entityType: revision.entityType, entityId: revision.entityId },
    orderBy: { revisionNumber: "desc" },
    select: { revisionNumber: true },
  });
  const revisionNumber = (last?.revisionNumber ?? 0) + 1;

  await tx.revision.create({
    data: {
      entityType: revision.entityType,
      entityId: revision.entityId,
      revisionNumber,
      origin: revision.origin,
      agentRunId: revision.agentRunId ?? null,
      summary: revision.summary,
      snapshotJson: revision.snapshotJson,
    },
  });

  return revisionNumber;
}

import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import type { RailSummary } from "@modules/workspaces/domain/rail-summary";

/**
 * Os números do rail — um resumo só, para todas as telas.
 *
 * O protótipo põe contagem em três destinos: `Bibliotecas 3`, `Publicações 24` e `Captura 7` com
 * badge de aviso. `WorkbenchModule` já aceitava `badge` desde sempre; o que faltava era a fonte.
 *
 * **Um resumo, e não uma consulta por tela.** Cada tela do produto monta o mesmo rail, então uma
 * contagem buscada onde ela é usada seria a mesma pergunta repetida em oito lugares, com oito
 * chances de divergir. Ele é lido uma vez por requisição, no layout raiz, e desce por contexto.
 *
 * A fila de captura é derivada — recorte que ainda não virou questão —, a mesma definição que a
 * estante e a Home usam. Duas definições de "pendente" na mesma tela é como um número passa a
 * discordar de si mesmo.
 */


export async function readRailSummary(): Promise<RailSummary> {
  const [libraries, publications, captureQueue, trash] = await Promise.all([
    prisma.workspace.count(),
    prisma.publication.count(),
    prisma.sourceAnchor.count({ where: { questions: { none: {} } } }),
    prisma.documentNode.count({ where: { deletedAt: { not: null } } }),
  ]);

  return { libraries, publications, captureQueue, trash };
}

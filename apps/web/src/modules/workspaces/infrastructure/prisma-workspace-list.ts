import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";

/**
 * A lista de workspaces.
 *
 * Num módulo e não na rota porque o lint de boundary recusa `app/**` tocando a camada de banco — e
 * a regra está certa: uma rota que consulta direto é uma rota que ninguém consegue testar sem
 * subir o Next inteiro.
 *
 * Ver issue #117.
 */

export interface WorkspaceSummary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

export async function listWorkspaces(): Promise<readonly WorkspaceSummary[]> {
  return prisma.workspace.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });
}

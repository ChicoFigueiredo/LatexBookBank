import { NextResponse } from "next/server";

import { listWorkspaces } from "@modules/workspaces/infrastructure/prisma-workspace-list";

import { toErrorResponse } from "../tree-http";

/**
 * Os workspaces existentes.
 *
 * Existe para o serviço de backup saber o que exportar sem tocar no banco (D36). Só id e slug: o
 * backup não precisa de mais, e uma rota que devolvesse o acervo inteiro seria uma segunda porta
 * para os dados sem nenhuma razão.
 *
 * Ver issue #117.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ workspaces: await listWorkspaces() });
  } catch (error) {
    return toErrorResponse(error);
  }
}

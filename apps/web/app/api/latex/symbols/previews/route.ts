import { NextResponse } from "next/server";

import { PrismaLatexSymbolReader } from "@modules/latex-knowledge/infrastructure/prisma-latex-knowledge-reader";

import { BadRequestError, toErrorResponse } from "../../../tree-http";

/**
 * As miniaturas de um grupo, por comando.
 *
 * Um grupo por requisição, e não um símbolo por requisição: `fontawesome5` tem 1.566 símbolos, e
 * buscar cada miniatura sozinha seriam 1.566 idas ao servidor para desenhar uma tela.
 *
 * O SVG que sai daqui já passou pela conversão de SVG font para `<path>` na importação — o formato
 * original não renderiza em navegador nenhum desde que Chrome, Firefox e Safari removeram
 * suporte a SVG fonts.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const group = new URL(request.url).searchParams.get("group");
    if (group === null || group.trim() === "") {
      throw new BadRequestError("`group` é obrigatório.");
    }

    const previews = await new PrismaLatexSymbolReader().listPreviews(group);
    return NextResponse.json({ group, previews });
  } catch (error) {
    return toErrorResponse(error);
  }
}

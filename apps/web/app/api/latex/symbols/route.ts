import { NextResponse } from "next/server";

import { PrismaLatexSymbolReader } from "@modules/latex-knowledge/infrastructure/prisma-latex-knowledge-reader";

/**
 * O índice da palette: 2.740 símbolos **sem** miniatura, mais os nomes dos 13 grupos.
 *
 * Medido contra o acervo: **291 KB** sem as miniaturas. Com elas o mesmo índice passaria de 2 MB,
 * e o grupo `fontawesome5` sozinho responde por 1,26 MB — mandar tudo seria pagar adiantado por
 * doze grupos que talvez ninguém abra.
 *
 * O índice, porém, vem **inteiro**: a busca atravessa os grupos, porque quem procura `alpha` não
 * sabe que ele mora em `greek`.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const reader = new PrismaLatexSymbolReader();
  const [groups, symbols] = await Promise.all([
    reader.listSymbolGroupNames(),
    reader.listSymbolIndex(),
  ]);

  return NextResponse.json({ groups, symbols });
}

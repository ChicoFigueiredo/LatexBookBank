import { NextResponse } from "next/server";

import { listPublicationCatalog } from "@modules/publications/infrastructure/prisma-publication-catalog";

/**
 * O catálogo de publicações do acervo.
 *
 * Existe porque "quais livros existem?" é pergunta de fora da tela: os E2E precisavam dela e
 * estavam raspando o HTML da página de publicações atrás de `href="/publications/<uuid>"` — que
 * funciona até alguém mexer no markup, e aí falha dizendo outra coisa.
 *
 * Só o que a lista mostra: id, título, biblioteca e contagem. Uma rota que devolvesse a árvore de
 * cada livro seria uma segunda porta para o acervo inteiro sem nenhuma razão.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ publications: await listPublicationCatalog() });
}

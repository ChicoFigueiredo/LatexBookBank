import { NextResponse } from "next/server";

import { toCompletionCandidate } from "@modules/latex-knowledge/domain/snippet-completion";
import { PrismaLatexKnowledgeReader } from "@modules/latex-knowledge/infrastructure/prisma-latex-knowledge-reader";

/**
 * Os itens de autocomplete do LaTeX.
 *
 * A rota é **global**, sem publicação no caminho: o vocabulário do LaTeX é o mesmo em toda
 * biblioteca, e pendurá-lo numa publicação faria o editor recarregar 652 itens a cada troca de
 * questão sem que nenhum deles mudasse.
 *
 * Devolve candidatos já traduzidos, não linhas do banco. Assim a ordenação e a decisão do que é
 * snippet ficam onde há teste — no domínio — e o cliente só adapta para os tipos do Monaco.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const snippets = await new PrismaLatexKnowledgeReader().listSnippets();

  return NextResponse.json({ snippets: snippets.map(toCompletionCandidate) });
}

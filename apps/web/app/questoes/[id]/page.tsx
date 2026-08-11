import { notFound, redirect } from "next/navigation";

import { findQuestionLocation } from "@modules/questions/infrastructure/prisma-question-location";

/**
 * De uma questão para o lugar dela.
 *
 * A busca global devolvia `questionId` e a paleta não tinha o que fazer com ele — o resultado
 * aparecia na lista e **não navegava** (§31 do prompt do time: eliminar resultado sem ação). Esta
 * rota é a ponte: resolve a publicação e o nó, e redireciona para o workbench já com o nó
 * selecionado.
 *
 * Redirect e não uma terceira tela de questão: a questão não existe fora do livro dela, e uma
 * rota que a mostrasse solta duplicaria o editor sem a árvore ao lado.
 */
export const dynamic = "force-dynamic";

export default async function QuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const location = await findQuestionLocation(id);
  if (!location) notFound();

  redirect(`/publications/${location.publicationId}?node=${location.nodeId}`);
}

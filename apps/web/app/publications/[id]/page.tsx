import { notFound } from "next/navigation";

import { readBookOverview } from "@modules/publications/infrastructure/prisma-book-overview";

import { BookOverviewScreen } from "./book-overview-screen";

/**
 * O overview de um livro (protótipo, 492–599).
 *
 * Esta rota abria o workbench direto. O editor mudou para `/publications/[id]/editor` e o lugar
 * onde se **escolhe o que fazer com o livro** passou a existir — que é o que o rail do protótipo
 * já dizia ao separar `Publicações` de `Editor do livro`.
 *
 * Server Component: o read model roda aqui e só DTO atravessa a fronteira.
 */

/** Dinâmica: contagem de questão e fila de captura mudam a cada edição. */
export const dynamic = "force-dynamic";

export default async function PublicationOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const book = await readBookOverview(id);
  if (!book) notFound();

  return <BookOverviewScreen book={book} />;
}

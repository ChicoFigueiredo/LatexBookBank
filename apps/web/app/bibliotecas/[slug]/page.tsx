import { notFound } from "next/navigation";

import { readLibraryShelf } from "@modules/workspaces/infrastructure/prisma-library-shelf";
import { PrismaLibraryRepository } from "@modules/workspaces/infrastructure/prisma-library-repository";
import { relativeTime } from "@/shared/format/relative-time";

import { LibraryScreen } from "./library-screen";

/** Uma biblioteca e os livros dentro dela. */
export const dynamic = "force-dynamic";

export default async function LibraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  // `?adicionar=1` chega do diálogo de criação: a biblioteca abre já perguntando de onde vem o
  // primeiro livro, em vez de exigir um segundo clique no mesmo passo do raciocínio.
  const addOnMount = (await searchParams)["adicionar"] === "1";

  const library = await new PrismaLibraryRepository().findBySlug(slug);
  if (!library) notFound();

  const shelf = await readLibraryShelf(library.id);

  // Um relógio só para a página: formatar no cliente faz servidor e hidratação discordarem na
  // virada do minuto, e hidratação abortada deixa a tela sem reagir a clique.
  const agora = new Date();

  return (
    <LibraryScreen
      addOnMount={addOnMount}
      library={{
        id: library.id,
        name: library.name,
        slug: library.slug,
        description: library.description,
      }}
      books={shelf.books.map((book) => ({
        ...book,
        updatedLabel: relativeTime(book.updatedAt, agora),
      }))}
      questionTotal={shelf.questionTotal}
      lastActivityLabel={shelf.lastActivity ? relativeTime(shelf.lastActivity, agora) : null}
    />
  );
}

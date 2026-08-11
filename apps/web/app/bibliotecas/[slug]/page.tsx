import { notFound } from "next/navigation";

import { PrismaPublicationRepository } from "@modules/publications/infrastructure/prisma-publication-repository";
import { PrismaLibraryRepository } from "@modules/workspaces/infrastructure/prisma-library-repository";

import { LibraryScreen } from "./library-screen";

/** Uma biblioteca e os livros dentro dela. */
export const dynamic = "force-dynamic";

export default async function LibraryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const library = await new PrismaLibraryRepository().findBySlug(slug);
  if (!library) notFound();

  const publications = await new PrismaPublicationRepository().listByWorkspaceId(library.id);

  return (
    <LibraryScreen
      library={{ id: library.id, name: library.name, slug: library.slug }}
      publications={publications.map((publication) => ({
        id: publication.id,
        title: publication.title,
        publisher: publication.publisher,
        nodeCount: publication.nodeCount,
      }))}
    />
  );
}

import { PrismaLibraryRepository } from "@modules/workspaces/infrastructure/prisma-library-repository";

import { LibrariesScreen } from "./libraries-screen";

/** Todas as bibliotecas do acervo. */
export const dynamic = "force-dynamic";

export default async function LibrariesPage() {
  const libraries = await new PrismaLibraryRepository().list();

  return (
    <LibrariesScreen
      libraries={libraries.map((library) => ({
        id: library.id,
        name: library.name,
        slug: library.slug,
        publicationCount: library.publicationCount,
        updatedAt: library.updatedAt.toISOString(),
      }))}
    />
  );
}

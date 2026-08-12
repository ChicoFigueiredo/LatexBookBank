import { PrismaLibraryRepository } from "@modules/workspaces/infrastructure/prisma-library-repository";
import { relativeTime } from "@/shared/format/relative-time";

import { LibrariesScreen } from "./libraries-screen";

/** Todas as bibliotecas do acervo. */
export const dynamic = "force-dynamic";

export default async function LibrariesPage() {
  const libraries = await new PrismaLibraryRepository().list();
  const agora = new Date();

  return (
    <LibrariesScreen
      libraries={libraries.map((library) => ({
        id: library.id,
        name: library.name,
        slug: library.slug,
        publicationCount: library.publicationCount,
        updatedLabel: relativeTime(library.updatedAt, agora),
      }))}
    />
  );
}

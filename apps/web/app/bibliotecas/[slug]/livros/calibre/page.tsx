import { notFound } from "next/navigation";

import { PrismaLibraryRepository } from "@modules/workspaces/infrastructure/prisma-library-repository";

import { CalibreScreen } from "./calibre-screen";

/** O wizard do Calibre: apontar a pasta → catálogo → revisar → importar → abrir. */
export const dynamic = "force-dynamic";

export default async function CalibrePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const library = await new PrismaLibraryRepository().findBySlug(slug);
  if (!library) notFound();

  return <CalibreScreen library={{ id: library.id, name: library.name, slug: library.slug }} />;
}

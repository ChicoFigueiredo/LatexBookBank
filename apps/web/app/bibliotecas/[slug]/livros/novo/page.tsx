import { notFound } from "next/navigation";

import { PrismaLibraryRepository } from "@modules/workspaces/infrastructure/prisma-library-repository";

import { NewPublicationScreen } from "./new-publication-screen";

/** Cadastro manual de livro. */
export const dynamic = "force-dynamic";

export default async function NewPublicationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const library = await new PrismaLibraryRepository().findBySlug(slug);
  if (!library) notFound();

  return (
    <NewPublicationScreen library={{ id: library.id, name: library.name, slug: library.slug }} />
  );
}

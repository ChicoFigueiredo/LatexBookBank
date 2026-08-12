import { notFound } from "next/navigation";

import { PrismaLibraryRepository } from "@modules/workspaces/infrastructure/prisma-library-repository";

import { NewPublicationScreen } from "./new-publication-screen";

/**
 * Cadastro manual de livro.
 *
 * `?fonte=arquivo` é a quarta origem do protótipo — "a partir de um arquivo". Ela não é uma tela
 * própria: um livro que nasce de um PDF é um livro cadastrado com uma fonte anexada, e o app já
 * sabe fazer as duas coisas. O que faltava era **dizer** que são duas, e emendá-las: com a flag, a
 * tela avisa na entrada e, ao salvar, a ação primária vira "Anexar a fonte" em vez do editor.
 */
export const dynamic = "force-dynamic";

export default async function NewPublicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const { fonte } = await searchParams;

  const library = await new PrismaLibraryRepository().findBySlug(slug);
  if (!library) notFound();

  return (
    <NewPublicationScreen
      library={{ id: library.id, name: library.name, slug: library.slug }}
      fromFile={fonte === "arquivo"}
    />
  );
}

import { notFound } from "next/navigation";

import { PrismaPublicationRepository } from "@modules/publications/infrastructure/prisma-publication-repository";
import { PrismaLibraryRepository } from "@modules/workspaces/infrastructure/prisma-library-repository";
import { env } from "@shared/config/env";

import { CalibreScreen } from "./calibre-screen";

/** O wizard do Calibre: apontar a pasta → catálogo → revisar → importar → abrir. */
export const dynamic = "force-dynamic";

/**
 * `?para=<id>` abre a **mesma** tela em modo "escolher para este livro" (D44.1).
 *
 * Query string, e não rota nova nem prop: rota nova duplicaria a tela que já lista, filtra, busca e
 * avisa de duplicata, e prop não sobrevive à navegação que vem do resumo do livro. Assim o endereço
 * carrega a intenção inteira — dá para voltar, recarregar e mandar o link — e a tela sem `para`
 * continua sendo exatamente o que era.
 *
 * O destino é resolvido **aqui**, no servidor, e não pelo id cru que o cliente mandou: é o que
 * permite mandar junto o que o livro já tem, para a tela poder dizer *quais campos vazios o
 * catálogo preencheria* antes de confirmar, sem inventar um endpoint de simulação.
 */
export default async function CalibrePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | readonly string[] | undefined>>;
}) {
  const { slug } = await params;
  const { para, q } = await searchParams;

  const library = await new PrismaLibraryRepository().findBySlug(slug);
  if (!library) notFound();

  const alvo =
    typeof para === "string" && para !== ""
      ? await new PrismaPublicationRepository().findDetailById(para)
      : null;

  // Livro de outra biblioteca não é destino desta tela: o catálogo abre no contexto de uma
  // biblioteca, e anexar através da fronteira seria uma escolha que ninguém fez conscientemente.
  const target =
    alvo && alvo.workspaceId === library.id
      ? {
          id: alvo.id,
          title: alvo.title,
          hasSource: alvo.sourcePdfAssetId !== null,
          metadata: {
            authors: alvo.authors,
            publisher: alvo.publisher,
            editionYear: alvo.editionYear,
            isbn: alvo.isbn,
            language: alvo.language,
            series: alvo.series,
            volume: alvo.volume,
          },
        }
      : null;

  return (
    <CalibreScreen
      library={{ id: library.id, name: library.name, slug: library.slug }}
      configuredRoot={env().calibreLibraryRoot}
      target={target}
      initialQuery={typeof q === "string" ? q : ""}
    />
  );
}

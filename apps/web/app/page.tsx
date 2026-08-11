import { readHomeOverview } from "@modules/workspaces/infrastructure/prisma-home-overview";
import { PrismaLibraryRepository } from "@modules/workspaces/infrastructure/prisma-library-repository";

import { HomeScreen } from "./home-screen";

/**
 * A Home do acervo.
 *
 * Server Component: os repositórios rodam aqui e só DTO atravessa para o cliente. Nenhum
 * componente importa Prisma — a regra de lint recusaria.
 *
 * **Sem `demo`.** A versão anterior listava as publicações do workspace `demo` hardcoded, o que
 * fazia a primeira tela do produto depender de um seed. Agora ela responde às três situações
 * reais: zero bibliotecas, uma, várias (§63 do prompt do time).
 */

/**
 * Dinâmica, não estática: a lista muda conforme o autor cria e importa publicações, e um
 * snapshot de build serviria dados velhos. No build também não há banco a consultar.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [libraries, overview] = await Promise.all([
    new PrismaLibraryRepository().list(),
    readHomeOverview(),
  ]);

  return (
    <HomeScreen
      libraries={libraries.map((library) => ({
        id: library.id,
        name: library.name,
        slug: library.slug,
        publicationCount: library.publicationCount,
      }))}
      continueWhere={
        overview.continueWhere
          ? {
              ...overview.continueWhere,
              updatedAt: overview.continueWhere.updatedAt.toISOString(),
            }
          : null
      }
      recent={overview.recent.map((entry) => ({
        ...entry,
        updatedAt: entry.updatedAt.toISOString(),
      }))}
      invalidCount={overview.invalidCount}
    />
  );
}

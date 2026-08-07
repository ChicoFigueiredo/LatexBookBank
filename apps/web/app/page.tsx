import Link from "next/link";

import { PrismaPublicationRepository } from "@modules/publications/infrastructure/prisma-publication-repository";

/**
 * Lista de publicações do workspace de demonstração.
 *
 * Server Component: o repository roda no servidor e o que chega ao cliente é DTO. Nenhum
 * componente importa Prisma — a regra de lint da issue #4 recusaria.
 *
 * **Sem estilo de propósito.** O design system é a Fase 1; esta tela existe para provar o
 * caminho de dados ponta a ponta, não a aparência.
 */

/**
 * Dinâmica, não estática: a lista muda conforme o autor cria e importa publicações, e um
 * snapshot de build serviria dados velhos. No build também não há banco a consultar — foi
 * exatamente assim que o CI pegou isto.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const repository = new PrismaPublicationRepository();
  const publications = await repository.listByWorkspaceSlug("demo");

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: "48rem" }}>
      <h1>LatexBookBank</h1>
      <p style={{ color: "#666" }}>Fase 0 — fundação e providers.</p>

      <h2 style={{ marginTop: "2rem" }}>Publicações</h2>

      {publications.length === 0 ? (
        <p>
          Nenhuma publicação ainda. Rode <code>bun run setup</code> para aplicar o seed de
          demonstração.
        </p>
      ) : (
        <ul>
          {publications.map((publication) => (
            <li key={publication.id} style={{ marginBottom: "0.5rem" }}>
              <Link href={`/publications/${publication.id}`}>{publication.title}</Link>
              {publication.publisher ? ` — ${publication.publisher}` : ""}{" "}
              <span style={{ color: "#666" }}>
                ({publication.nodeCount} {publication.nodeCount === 1 ? "nó" : "nós"})
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

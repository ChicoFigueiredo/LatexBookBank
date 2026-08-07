import Link from "next/link";
import { notFound } from "next/navigation";

import { getPublicationTree } from "@modules/document-tree/application/get-publication-tree";
import { PrismaDocumentTreeRepository } from "@modules/document-tree/infrastructure/prisma-document-tree-repository";
import { PrismaPublicationRepository } from "@modules/publications/infrastructure/prisma-publication-repository";

/**
 * Árvore de uma publicação, com as questões.
 *
 * A letra de cada alternativa é **calculada na projeção** (`optionLabelAt`), nunca lida do
 * banco: é o antipadrão do legado que a spec §8.5 manda eliminar. Reordenar as alternativas
 * troca a letra e o gabarito segue a alternativa, não a posição.
 */

/** Dinâmica: o conteúdo muda a cada edição, e no build não há banco a consultar. */
export const dynamic = "force-dynamic";

export default async function PublicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const publication = await new PrismaPublicationRepository().findById(id);
  if (!publication) notFound();

  const nodes = await getPublicationTree(new PrismaDocumentTreeRepository(), id);

  return (
    <main style={{ padding: "var(--space-8)", maxWidth: "48rem" }}>
      <Link href="/">← Publicações</Link>
      <h1 style={{ marginTop: "var(--space-4)" }}>{publication.title}</h1>

      {nodes.length === 0 ? (
        <p>Publicação sem conteúdo.</p>
      ) : (
        <ol style={{ listStyle: "none", padding: 0 }}>
          {nodes.map((node) => (
            <li
              key={node.id}
              style={{
                marginLeft: `calc(${node.depth} * var(--space-6))`,
                marginTop: "var(--space-4)",
              }}
            >
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "var(--text-meta)",
                  textTransform: "uppercase",
                  letterSpacing: "var(--tracking-wide)",
                }}
              >
                {node.kind}
                {node.originalLabel ? ` · ${node.originalLabel}` : ""}
              </div>
              <strong>{node.title}</strong>

              {node.question && (
                <div style={{ marginTop: "var(--space-2)" }}>
                  <p style={{ margin: "var(--space-1) 0" }}>{node.question.statementLatex}</p>
                  <div style={{ color: "var(--text-secondary)", fontSize: "var(--text-body-sm)" }}>
                    {node.question.difficultyLabel}
                    {node.question.source ? ` · ${node.question.source}` : ""}
                  </div>

                  {node.question.options.length > 0 && (
                    <ul style={{ listStyle: "none", padding: 0, marginTop: "var(--space-2)" }}>
                      {node.question.options.map((option) => (
                        <li key={option.id}>
                          <strong>{option.label})</strong> {option.statementLatex}
                          {option.isCorrect && <span style={{ color: "var(--ok-text)" }}> ✓</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}

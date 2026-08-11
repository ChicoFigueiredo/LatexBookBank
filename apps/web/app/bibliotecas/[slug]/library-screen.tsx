"use client";

import Link from "next/link";
import { useState } from "react";

import { Button, EmptyState, Icon, Modal, PageHeader } from "@/design-system";

import { useAcervoStyles } from "../../acervo-styles";
import { AppShell } from "../../app-shell";

/**
 * Uma biblioteca aberta: os livros dentro dela e o caminho para acrescentar o próximo.
 *
 * "Adicionar livro" abre as três entradas do design (§5 dos ajustes finais): cadastro manual,
 * Calibre e arquivo `.lbb`. As três funcionam — nenhuma é botão morto (§81).
 */

export interface LibraryScreenPublication {
  readonly id: string;
  readonly title: string;
  readonly publisher: string | null;
  readonly nodeCount: number;
}

export interface LibraryScreenProps {
  readonly library: { readonly id: string; readonly name: string; readonly slug: string };
  readonly publications: readonly LibraryScreenPublication[];
}

export function LibraryScreen({ library, publications }: LibraryScreenProps) {
  useAcervoStyles();
  const [adding, setAdding] = useState(false);

  const addBook = (
    <Button size="sm" variant="primary" icon="plus" onClick={() => setAdding(true)}>
      Adicionar livro
    </Button>
  );

  return (
    <AppShell
      activeModule="bibliotecas"
      breadcrumb={[{ label: "Bibliotecas", href: "/bibliotecas" }, { label: library.name }]}
      actions={addBook}
    >
      <div className="lbb-acervo">
        <PageHeader
          eyebrow="BIBLIOTECA"
          title={library.name}
          meta={`${publications.length} ${publications.length === 1 ? "livro" : "livros"}`}
        />

        {publications.length === 0 ? (
          <EmptyState
            icon="book-open"
            title="Biblioteca criada — falta o primeiro livro"
            description="Cadastre um livro à mão, importe do Calibre ou traga um arquivo. Dá para começar só com o título."
            action={
              <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
                Adicionar primeiro livro
              </Button>
            }
          />
        ) : (
          <div className="lbb-acervo-grid">
            {publications.map((publication) => (
              <Link key={publication.id} className="lbb-card" href={`/publications/${publication.id}`}>
                <span className="lbb-card-title">
                  <Icon name="book-open" />
                  {publication.title}
                </span>
                <span className="lbb-card-meta">
                  {[publication.publisher, `${publication.nodeCount} nós`]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        eyebrow="ADICIONAR LIVRO"
        title="Como o livro entra?"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <Button
            variant="secondary"
            icon="pencil"
            href={`/bibliotecas/${library.slug}/livros/novo`}
            style={{ justifyContent: "flex-start" }}
          >
            Cadastrar manualmente
          </Button>
          <Button
            variant="secondary"
            icon="library"
            href={`/bibliotecas/${library.slug}/livros/calibre`}
            style={{ justifyContent: "flex-start" }}
          >
            Importar do Calibre
          </Button>
          <Button
            variant="secondary"
            icon="download-cloud"
            href="/importar"
            style={{ justifyContent: "flex-start" }}
          >
            Importar arquivo .lbb
          </Button>
        </div>
      </Modal>
    </AppShell>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";

import { Button, EmptyState, Icon, Input, PageHeader } from "@/design-system";
import { relativeTime } from "@/shared/format/relative-time";

import { useAcervoStyles } from "../acervo-styles";
import { AppShell } from "../app-shell";

export interface CatalogPublication {
  readonly id: string;
  readonly title: string;
  readonly libraryName: string;
  readonly librarySlug: string;
  readonly questionCount: number;
  readonly updatedAt: string;
}

/** O catálogo de livros — o caminho para abrir um livro e para começar uma captura. */
export function PublicationsScreen({
  publications,
}: {
  readonly publications: readonly CatalogPublication[];
}) {
  useAcervoStyles();
  const [query, setQuery] = useState("");
  const now = new Date();

  // Sem `useMemo`: o React Compiler memoiza sozinho, e a memoização manual aqui é justamente a
  // que ele não consegue preservar — o lint recusa. Título **e** biblioteca no filtro: quem digita
  // "concursos" procura pela biblioteca, e um filtro só de título devolveria vazio sobre um acervo
  // que tem o que se procura.
  const text = query.trim().toLocaleLowerCase("pt-BR");
  const shown =
    text === ""
      ? publications
      : publications.filter(
          (entry) =>
            entry.title.toLocaleLowerCase("pt-BR").includes(text) ||
            entry.libraryName.toLocaleLowerCase("pt-BR").includes(text),
        );

  return (
    <AppShell
      activeModule="publicacoes"
      breadcrumb={[{ label: "Publicações" }]}
      actions={
        <Button size="sm" variant="secondary" icon="library" href="/bibliotecas">
          Bibliotecas
        </Button>
      }
    >
      <div className="lbb-acervo">
        <PageHeader
          eyebrow="ACERVO"
          title="Publicações"
          meta={`${publications.length} ${publications.length === 1 ? "livro" : "livros"}`}
        />

        {publications.length === 0 ? (
          <EmptyState
            icon="book-open"
            title="Nenhum livro ainda"
            description="Os livros entram por uma biblioteca — crie uma e cadastre o primeiro."
            action={
              <Button variant="primary" icon="library" href="/bibliotecas">
                Ir para bibliotecas
              </Button>
            }
          />
        ) : (
          <>
            <div style={{ maxWidth: "22rem", marginTop: "var(--space-4)" }}>
              <Input
                size="sm"
                placeholder="Filtrar por título ou biblioteca…"
                aria-label="Filtrar publicações"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            <div className="lbb-acervo-grid" style={{ marginTop: "var(--space-4)" }}>
              {shown.map((entry) => (
                <div key={entry.id} className="lbb-card">
                  <Link
                    className="lbb-card-title"
                    href={`/publications/${entry.id}`}
                    style={{ textDecoration: "none" }}
                  >
                    <Icon name="book-open" />
                    {entry.title}
                  </Link>
                  <span className="lbb-card-meta">
                    {entry.libraryName} · {entry.questionCount}{" "}
                    {entry.questionCount === 1 ? "questão" : "questões"} ·{" "}
                    {relativeTime(new Date(entry.updatedAt), now)}
                  </span>
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <Button size="sm" variant="ghost" icon="list-tree" href={`/publications/${entry.id}`}>
                      Abrir
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="scan-text"
                      href={`/publications/${entry.id}/ingestao`}
                    >
                      Capturar
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {shown.length === 0 && (
              <div style={{ marginTop: "var(--space-4)" }}>
                <EmptyState
                  icon="search"
                  title="Nada encontrado"
                  description="Nenhum livro casa com este filtro."
                />
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

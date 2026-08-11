"use client";

import Link from "next/link";
import { useState } from "react";

import { Badge, Button, EmptyState, Icon, PageHeader } from "@/design-system";
import { relativeTime } from "@/shared/format/relative-time";

import { useAcervoStyles } from "./acervo-styles";
import { AppShell } from "./app-shell";
import { CreateLibraryDialog } from "./create-library-dialog";

/**
 * Home — primeiro uso e uso recorrente na mesma tela (design §18 e §19).
 *
 * Sem dashboard: quem chega com acervo vazio vê os caminhos para começar, e quem já trabalha vê
 * **onde parou** antes de qualquer número. A ordem da tela é a ordem da pergunta que o usuário
 * traz ao abrir o produto.
 */

export interface HomeLibrary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly publicationCount: number;
}

export interface HomeContinue {
  readonly questionId: string;
  readonly nodeId: string;
  readonly publicationId: string;
  readonly publicationTitle: string;
  readonly libraryName: string;
  readonly path: string;
  readonly updatedAt: string;
}

export interface HomeRecent {
  readonly id: string;
  readonly title: string;
  readonly libraryName: string;
  readonly librarySlug: string;
  readonly questionCount: number;
  readonly updatedAt: string;
}

export interface HomeScreenProps {
  readonly libraries: readonly HomeLibrary[];
  readonly continueWhere: HomeContinue | null;
  readonly recent: readonly HomeRecent[];
  readonly invalidCount: number;
}

export function HomeScreen({ libraries, continueWhere, recent, invalidCount }: HomeScreenProps) {
  useAcervoStyles();
  const [creating, setCreating] = useState(false);

  // O relógio é lido no render do **cliente**: o servidor manda o ISO e o texto relativo se
  // resolve onde o usuário está. Formatar no servidor daria "há 3 horas" para quem abriu agora,
  // em outro fuso.
  const now = new Date();

  return (
    <AppShell
      activeModule="inicio"
      breadcrumb={[{ label: "Início" }]}
      actions={
        <Button size="sm" variant="primary" icon="plus" onClick={() => setCreating(true)}>
          Criar biblioteca
        </Button>
      }
      statusLeft={
        <>
          <span>SQLite · local</span>
          <span>
            {libraries.length} {libraries.length === 1 ? "biblioteca" : "bibliotecas"}
          </span>
        </>
      }
    >
      <div className="lbb-acervo">
        {libraries.length === 0 ? (
          <>
            <PageHeader
              eyebrow="ACERVO"
              title="Comece seu acervo"
              meta="Uma biblioteca guarda seus livros, as questões que você extrai deles e a origem de cada uma."
            />
            <div className="lbb-acervo-actions">
              <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
                Criar biblioteca
              </Button>
              <Button variant="secondary" icon="download-cloud" href="/importar">
                Importar biblioteca
              </Button>
            </div>
            <div style={{ marginTop: "var(--space-7)" }}>
              <EmptyState
                icon="library"
                title="Nenhuma biblioteca ainda"
                description="O acervo começa vazio de propósito — sem seed, sem demonstração. O primeiro livro entra depois da primeira biblioteca."
              />
            </div>
          </>
        ) : (
          <>
            <PageHeader
              eyebrow="ACERVO"
              title="Início"
              meta="Continue de onde parou ou abra uma biblioteca."
            />

            {continueWhere && (
              <div className="lbb-acervo-section">
                <div className="lbb-acervo-eyebrow">Continuar</div>
                <div className="lbb-banner-row">
                  <Icon name="file-text" />
                  <div className="lbb-banner-body">
                    <div className="lbb-banner-title">{continueWhere.publicationTitle}</div>
                    <div className="lbb-banner-sub" title={continueWhere.path}>
                      {continueWhere.path}
                    </div>
                    <div className="lbb-card-meta">
                      {continueWhere.libraryName} · editado{" "}
                      {relativeTime(new Date(continueWhere.updatedAt), now)}
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    href={`/publications/${continueWhere.publicationId}?node=${continueWhere.nodeId}`}
                  >
                    Continuar
                  </Button>
                </div>
              </div>
            )}

            {invalidCount > 0 && (
              <div className="lbb-acervo-section">
                <div className="lbb-acervo-eyebrow">Pendências de revisão</div>
                <div className="lbb-banner-row" data-tone="warn">
                  <Icon name="triangle-alert" />
                  <div className="lbb-banner-body">
                    <div className="lbb-banner-title">
                      {invalidCount} {invalidCount === 1 ? "questão inválida" : "questões inválidas"}
                    </div>
                    <div className="lbb-banner-sub">
                      A validação reprovou — enunciado, alternativas ou gabarito.
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="lbb-acervo-section">
              <div className="lbb-acervo-eyebrow">Bibliotecas</div>
              <div className="lbb-acervo-grid">
                {libraries.map((library) => (
                  <Link key={library.id} className="lbb-card" href={`/bibliotecas/${library.slug}`}>
                    <span className="lbb-card-title">
                      <Icon name="library" />
                      {library.name}
                    </span>
                    <span className="lbb-card-meta">
                      {library.publicationCount}{" "}
                      {library.publicationCount === 1 ? "livro" : "livros"}
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {recent.length > 0 && (
              <div className="lbb-acervo-section">
                <div className="lbb-acervo-eyebrow">Livros recentes</div>
                <div className="lbb-acervo-grid">
                  {recent.map((entry) => (
                    <Link key={entry.id} className="lbb-card" href={`/publications/${entry.id}`}>
                      <span className="lbb-card-title">
                        <Icon name="book-open" />
                        {entry.title}
                      </span>
                      <span className="lbb-card-meta">
                        {entry.libraryName} · {entry.questionCount}{" "}
                        {entry.questionCount === 1 ? "questão" : "questões"}
                      </span>
                      <span>
                        <Badge tone="neutral" mono>
                          {relativeTime(new Date(entry.updatedAt), now)}
                        </Badge>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <CreateLibraryDialog open={creating} onClose={() => setCreating(false)} />
    </AppShell>
  );
}

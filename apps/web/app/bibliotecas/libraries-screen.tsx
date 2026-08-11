"use client";

import Link from "next/link";
import { useState } from "react";

import { Button, EmptyState, Icon, PageHeader } from "@/design-system";
import { relativeTime } from "@/shared/format/relative-time";

import { useAcervoStyles } from "../acervo-styles";
import { AppShell } from "../app-shell";
import { CreateLibraryDialog } from "../create-library-dialog";

export interface LibrariesScreenLibrary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly publicationCount: number;
  readonly updatedAt: string;
}

/** A lista de bibliotecas — o acervo visto de cima. */
export function LibrariesScreen({
  libraries,
}: {
  readonly libraries: readonly LibrariesScreenLibrary[];
}) {
  useAcervoStyles();
  const [creating, setCreating] = useState(false);
  const now = new Date();

  return (
    <AppShell
      activeModule="bibliotecas"
      breadcrumb={[{ label: "Bibliotecas" }]}
      actions={
        <>
          <Button size="sm" variant="ghost" icon="download-cloud" href="/importar">
            Importar
          </Button>
          <Button size="sm" variant="primary" icon="plus" onClick={() => setCreating(true)}>
            Criar biblioteca
          </Button>
        </>
      }
    >
      <div className="lbb-acervo">
        <PageHeader
          eyebrow="ACERVO"
          title="Bibliotecas"
          meta={`${libraries.length} ${libraries.length === 1 ? "biblioteca" : "bibliotecas"}`}
        />

        {libraries.length === 0 ? (
          <EmptyState
            icon="library"
            title="Nenhuma biblioteca ainda"
            description="Crie a primeira ou importe um arquivo .lbb de outro computador."
            action={
              <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
                Criar biblioteca
              </Button>
            }
          />
        ) : (
          <div className="lbb-acervo-grid">
            {libraries.map((library) => (
              <Link key={library.id} className="lbb-card" href={`/bibliotecas/${library.slug}`}>
                <span className="lbb-card-title">
                  <Icon name="library" />
                  {library.name}
                </span>
                <span className="lbb-card-meta">
                  {library.publicationCount} {library.publicationCount === 1 ? "livro" : "livros"} ·{" "}
                  {relativeTime(new Date(library.updatedAt), now)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <CreateLibraryDialog open={creating} onClose={() => setCreating(false)} />
    </AppShell>
  );
}

"use client";

import { useState } from "react";

import { Button, EmptyState, PageHeader } from "@/design-system";

import { useAcervoStyles } from "../acervo-styles";
import { AppShell } from "../app-shell";
import { CreateLibraryDialog } from "../create-library-dialog";
import { DeleteLibraryDialog, type DeleteLibraryTarget } from "../delete-library-dialog";
import { LibraryCard } from "../library-card";

export interface LibrariesScreenLibrary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly publicationCount: number;
  /** Já formatado no servidor: formatar no cliente quebra a hidratação na virada do minuto. */
  readonly updatedLabel: string;
}

/** A lista de bibliotecas — o acervo visto de cima. */
export function LibrariesScreen({
  libraries,
}: {
  readonly libraries: readonly LibrariesScreenLibrary[];
}) {
  useAcervoStyles();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<DeleteLibraryTarget | null>(null);

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
              <LibraryCard
                key={library.id}
                href={`/bibliotecas/${library.slug}`}
                name={library.name}
                meta={`${library.publicationCount} ${
                  library.publicationCount === 1 ? "livro" : "livros"
                } · ${library.updatedLabel}`}
                onDelete={() => setDeleting({ id: library.id, name: library.name })}
              />
            ))}
          </div>
        )}
      </div>

      <CreateLibraryDialog open={creating} onClose={() => setCreating(false)} />
      <DeleteLibraryDialog target={deleting} onClose={() => setDeleting(null)} />
    </AppShell>
  );
}

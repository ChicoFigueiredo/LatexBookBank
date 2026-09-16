"use client";

import { ScanWorkspace, type ScanWorkspaceProps } from "@modules/scan/ui/ScanWorkspace";

import { AppShell } from "../../../../app-shell";

/** A revisão dentro do shell: breadcrumb até o livro, e a tela inteira para as três áreas. */
export function ScanRunScreen({
  title,
  library,
  ...workspace
}: ScanWorkspaceProps & {
  readonly title: string;
  readonly library?: { readonly name: string; readonly slug: string };
}) {
  const { publicationId } = workspace;
  return (
    <AppShell
      activeModule="captura"
      publicationId={publicationId}
      breadcrumb={[
        ...(library
          ? [
              { label: "Bibliotecas", href: "/bibliotecas" },
              { label: library.name, href: `/bibliotecas/${library.slug}` },
            ]
          : [{ label: "Publicações", href: "/publicacoes" }]),
        { label: title, href: `/publications/${publicationId}` },
        { label: "Scan", href: `/publications/${publicationId}/scan` },
        { label: "Revisão" },
      ]}
    >
      <ScanWorkspace {...workspace} />
    </AppShell>
  );
}

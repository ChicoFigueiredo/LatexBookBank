"use client";

import { useState } from "react";

import { Callout, PageHeader } from "@/design-system";
import { IngestionPanel } from "@modules/recognition/ui/IngestionPanel";

/**
 * A moldura da ingestão: cabeçalho, o painel, e o que fazer com o LaTeX aceito.
 *
 * O aceito fica **aqui, na tela**, e não vai direto para o banco. Reconhecimento é candidato até
 * alguém conferir (§19), e conferir inclui decidir em qual questão aquilo entra — decisão que
 * ainda não foi tomada quando o recorte acabou de ser lido.
 *
 * Ver spec §10 · §19 · issue #135.
 */

export interface IngestionScreenProps {
  readonly publicationId: string;
  readonly workspaceId: string;
  readonly title: string;
}

export function IngestionScreen({ publicationId, workspaceId, title }: IngestionScreenProps) {
  const [accepted, setAccepted] = useState<readonly string[]>([]);

  return (
    <main style={{ display: "grid", gap: "var(--space-3)" }}>
      <PageHeader
        eyebrow="ingestão"
        title={title}
        meta="Suba um PDF ou imagem, recorte a questão, e confira o LaTeX antes de usar."
      />

      <IngestionPanel
        workspaceId={workspaceId}
        publicationId={publicationId}
        onAccept={(latex) => setAccepted((current) => [...current, latex])}
      />

      {accepted.length > 0 && (
        <div style={{ padding: "0 var(--space-4) var(--space-4)" }}>
          <Callout tone="info" title={`${accepted.length} recorte(s) conferido(s)`}>
            O LaTeX conferido fica aqui até você colar na questão. Ele não é gravado sozinho —
            escolher onde entra é parte da revisão.
            <ul style={{ margin: "8px 0 0", paddingLeft: "1.2rem" }}>
              {accepted.map((latex, index) => (
                <li key={index} style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
                  {latex.length > 120 ? `${latex.slice(0, 120)}…` : latex}
                </li>
              ))}
            </ul>
          </Callout>
        </div>
      )}
    </main>
  );
}

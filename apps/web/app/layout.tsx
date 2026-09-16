import type { Metadata } from "next";
import type { ReactNode } from "react";

import { readRailSummary } from "@modules/workspaces/infrastructure/prisma-rail-summary";

import "@/design-system/tokens.css";

import { RailCountsProvider } from "./rail-counts";

export const metadata: Metadata = {
  title: "LatexBookBank",
  description: "Biblioteca técnica, IDE LaTeX editorial e banco de questões estruturado",
};

/**
 * Dinâmico porque o layout lê o banco.
 *
 * As contagens do rail mudam a cada edição, e o rail está em toda tela — lê-las aqui é o que
 * evita a mesma consulta repetida em oito páginas. As páginas já eram `force-dynamic` por conta
 * própria; o que muda é que agora o motivo está declarado num lugar só.
 */
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const rail = await readRailSummary();

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          background: "var(--bg)",
          color: "var(--text-primary)",
          font: `var(--text-body)/var(--leading-normal) var(--font-ui)`,
        }}
      >
        <RailCountsProvider value={rail}>{children}</RailCountsProvider>
      </body>
    </html>
  );
}

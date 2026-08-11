import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@/design-system/tokens.css";

export const metadata: Metadata = {
  title: "LatexBookBank",
  description: "Biblioteca técnica, IDE LaTeX editorial e banco de questões estruturado",
};

export default function RootLayout({ children }: { children: ReactNode }) {
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
        {children}
      </body>
    </html>
  );
}

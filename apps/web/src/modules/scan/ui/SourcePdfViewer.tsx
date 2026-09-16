"use client";

import dynamic from "next/dynamic";

export type { SourcePdfViewerProps } from "./SourcePdfViewerInner";

/**
 * Carregado só no navegador: o `pdf.js` toca `window` ao ser importado, e o worker precisa de uma
 * URL que só existe lá. Mesmo motivo do `PdfCropViewer`.
 */
export const SourcePdfViewer = dynamic(() => import("./SourcePdfViewerInner"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, color: "var(--text-muted)" }}>Abrindo o PDF…</div>,
});

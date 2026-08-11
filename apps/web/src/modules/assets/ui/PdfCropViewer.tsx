"use client";

import dynamic from "next/dynamic";

/**
 * `ssr: false` pelo mesmo motivo do editor: `pdfjs-dist` toca `window` ao carregar, e o worker
 * precisa de uma URL que só existe no navegador.
 */
export const PdfCropViewer = dynamic(() => import("./PdfCropViewerInner"), {
  ssr: false,
  loading: () => <div style={{ padding: "var(--space-4)" }}>Abrindo o PDF…</div>,
});

export type { PdfCropViewerInnerProps as PdfCropViewerProps } from "./PdfCropViewerInner";

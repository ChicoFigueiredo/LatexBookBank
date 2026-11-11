import type { FigureSource } from "./PreviewBlocks";

const byPublication = new Map<string, FigureSource>();

/**
 * O endereço do PNG de cada figura citada no LaTeX de uma publicação — a rota
 * `/api/publications/:id/figures/:name`, que acha o asset pelo nome e rasteriza o recorte em PDF.
 *
 * A mesma função para a mesma publicação: o preview a recebe em contexto, e uma função nova a
 * cada render faria todas as figuras da tela renderizarem de novo.
 */
export function publicationFigureSource(publicationId: string): FigureSource {
  let source = byPublication.get(publicationId);
  if (source === undefined) {
    source = (path) =>
      `/api/publications/${encodeURIComponent(publicationId)}/figures/${encodeURIComponent(path)}`;
    byPublication.set(publicationId, source);
  }
  return source;
}

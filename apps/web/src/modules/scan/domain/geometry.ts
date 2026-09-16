import type { NormalizedBox } from "@modules/assets/domain/source-anchor";

/**
 * Retângulos em **pontos do PDF**, origem no canto superior esquerdo, y para baixo — a mesma
 * convenção da `segmentar-pagina` e de toda caixa normalizada do projeto (D28).
 *
 * O scan raciocina em pontos porque é neles que as tolerâncias fazem sentido ("a calha mede 3 a
 * 8 pt"); só vira fração de página na hora de propor uma âncora.
 */
export interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export const width = (rect: Rect): number => rect.x1 - rect.x0;
export const height = (rect: Rect): number => rect.y1 - rect.y0;
export const centerX = (rect: Rect): number => (rect.x0 + rect.x1) / 2;
export const centerY = (rect: Rect): number => (rect.y0 + rect.y1) / 2;

export function union(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;

  return {
    x0: Math.min(...rects.map((r) => r.x0)),
    y0: Math.min(...rects.map((r) => r.y0)),
    x1: Math.max(...rects.map((r) => r.x1)),
    y1: Math.max(...rects.map((r) => r.y1)),
  };
}

/** Quanto da altura de `inner` cai dentro da faixa vertical de `outer`, de 0 a 1. */
export function verticalCoverage(inner: Rect, outer: Rect): number {
  const h = height(inner);
  if (h <= 0) return inner.y0 >= outer.y0 && inner.y0 <= outer.y1 ? 1 : 0;

  const overlap = Math.min(inner.y1, outer.y1) - Math.max(inner.y0, outer.y0);
  return Math.max(0, overlap) / h;
}

/** Área da interseção dividida pela área do menor — 1 quando um contém o outro. */
export function overlapRatio(a: Rect, b: Rect): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (w <= 0 || h <= 0) return 0;

  const smaller = Math.min(width(a) * height(a), width(b) * height(b));
  return smaller > 0 ? (w * h) / smaller : 0;
}

const PRECISION = 1e6;
const round = (value: number): number => Math.round(value * PRECISION) / PRECISION;

/**
 * A caixa em frações da página, presa às bordas.
 *
 * Prender em vez de recusar, como a `segmentar-pagina`: quem desenhou foi a aritmética, e uma
 * folga que vaza dois pontos na margem não é erro de ninguém. Seis casas, as de `normalizeAnchor`.
 */
export function toNormalizedBox(
  rect: Rect,
  page: { readonly width: number; readonly height: number },
): NormalizedBox {
  const x0 = clamp(rect.x0, 0, page.width);
  const y0 = clamp(rect.y0, 0, page.height);
  const x1 = clamp(rect.x1, x0, page.width);
  const y1 = clamp(rect.y1, y0, page.height);

  const x = round(x0 / page.width);
  const y = round(y0 / page.height);

  return {
    x,
    y,
    width: Math.min(round((x1 - x0) / page.width), round(1 - x)),
    height: Math.min(round((y1 - y0) / page.height), round(1 - y)),
  };
}

export function fromNormalizedBox(
  box: NormalizedBox,
  page: { readonly width: number; readonly height: number },
): Rect {
  return {
    x0: box.x * page.width,
    y0: box.y * page.height,
    x1: (box.x + box.width) * page.width,
    y1: (box.y + box.height) * page.height,
  };
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1] ?? 0;
}

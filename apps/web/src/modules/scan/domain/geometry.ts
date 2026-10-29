import type { Rect } from "@/shared/geometry/normalized-box";

/**
 * As medidas que o scan faz sobre retângulos em **pontos do PDF** — o `Rect` e as conversões para
 * a caixa normalizada são de todos, e moram em `src/shared/geometry` (ARQ-12).
 */
export type { Rect };

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
  const intersection = intersectionArea(a, b);
  if (intersection === 0) return 0;

  const smaller = Math.min(width(a) * height(a), width(b) * height(b));
  return smaller > 0 ? intersection / smaller : 0;
}

/** A área que os dois retângulos têm em comum; 0 quando não se tocam. */
function intersectionArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Área da interseção dividida pela área da união — 1 só quando as duas caixas coincidem.
 *
 * É a pergunta "é o mesmo lugar?", e não "um contém o outro?". A diferença morde na aprovação em
 * rodadas (#247): pela `overlapRatio`, o exercício pequeno dentro da âncora do grupo — que cobre a
 * página inteira — dava 1, e virava "já no acervo" apontando para o grupo.
 */
export function intersectionOverUnion(a: Rect, b: Rect): number {
  const intersection = intersectionArea(a, b);
  if (intersection === 0) return 0;

  const union = width(a) * height(a) + width(b) * height(b) - intersection;
  return union > 0 ? intersection / union : 0;
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1] ?? 0;
}

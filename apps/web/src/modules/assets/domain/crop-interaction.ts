import type { PixelRect } from "./source-anchor";

/**
 * As regras de desenhar e ajustar o retângulo de recorte.
 *
 * Módulo puro, e não lógica dentro de `onMouseMove`: arrastar, redimensionar e prender à página
 * são **regras** — e regra dentro de um handler de evento é regra que ninguém testa. O que fica
 * no componente é o canvas e o `pdf.js`, que só a conferência visual resolve.
 *
 * Ver spec §18 · issue #133.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface PageSize {
  readonly width: number;
  readonly height: number;
}

/** As oito alças, mais o corpo para arrastar o retângulo inteiro. */
export const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w", "move"] as const;
export type Handle = (typeof HANDLES)[number];

/** Menor recorte que faz sentido. Abaixo disso é clique, não desenho. */
export const MIN_SIZE_PX = 8;

/** Raio de captura de uma alça, em pixels de tela. */
export const HANDLE_RADIUS_PX = 8;

/**
 * O retângulo a partir de dois pontos, em qualquer ordem.
 *
 * Arrastar da direita para a esquerda é tão natural quanto o contrário, e um retângulo com
 * largura negativa quebraria tudo daqui para a frente.
 */
export function rectFromDrag(start: Point, end: Point, page: PageSize): PixelRect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);

  return clampToPage(
    { x, y, width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) },
    page,
  );
}

/**
 * Prende o retângulo à página.
 *
 * O mouse sai da imagem o tempo todo — ao arrastar rápido, ao chegar na borda. Sem isto, o
 * recorte teria coordenada negativa e a normalização recusaria um desenho que a pessoa fez com
 * naturalidade.
 */
export function clampToPage(rect: PixelRect, page: PageSize): PixelRect {
  const x = Math.max(0, Math.min(rect.x, page.width));
  const y = Math.max(0, Math.min(rect.y, page.height));

  return {
    x,
    y,
    width: Math.max(0, Math.min(rect.width, page.width - x)),
    height: Math.max(0, Math.min(rect.height, page.height - y)),
  };
}

/** `true` quando o desenho é grande o bastante para valer como recorte. */
export const isUsable = (rect: PixelRect): boolean =>
  rect.width >= MIN_SIZE_PX && rect.height >= MIN_SIZE_PX;

/**
 * Qual alça está sob o ponto, se alguma.
 *
 * As quinas ganham prioridade sobre os lados: elas se sobrepõem nos cantos, e quem mira um canto
 * quer redimensionar nas duas direções — acertar o lado ali seria sempre frustrante.
 */
export function handleAt(point: Point, rect: PixelRect, radius = HANDLE_RADIUS_PX): Handle | null {
  const { x, y, width, height } = rect;
  const midX = x + width / 2;
  const midY = y + height / 2;

  const corners: ReadonlyArray<readonly [Handle, Point]> = [
    ["nw", { x, y }],
    ["ne", { x: x + width, y }],
    ["se", { x: x + width, y: y + height }],
    ["sw", { x, y: y + height }],
  ];
  const sides: ReadonlyArray<readonly [Handle, Point]> = [
    ["n", { x: midX, y }],
    ["e", { x: x + width, y: midY }],
    ["s", { x: midX, y: y + height }],
    ["w", { x, y: midY }],
  ];

  for (const [handle, center] of [...corners, ...sides]) {
    if (Math.abs(point.x - center.x) <= radius && Math.abs(point.y - center.y) <= radius) {
      return handle;
    }
  }

  const inside = point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;

  return inside ? "move" : null;
}

/**
 * Aplica o arrasto de uma alça.
 *
 * O retângulo é normalizado no fim: puxar a alça `nw` para além da `se` inverte os lados, e o
 * comportamento que as pessoas esperam é o retângulo virar do avesso e continuar — não travar.
 */
export function resize(rect: PixelRect, handle: Handle, delta: Point, page: PageSize): PixelRect {
  if (handle === "move") {
    return clampToPage({ ...rect, x: rect.x + delta.x, y: rect.y + delta.y }, page);
  }

  let { x, y, width, height } = rect;

  if (handle.includes("w")) {
    x += delta.x;
    width -= delta.x;
  }
  if (handle.includes("e")) width += delta.x;
  if (handle.includes("n")) {
    y += delta.y;
    height -= delta.y;
  }
  if (handle.includes("s")) height += delta.y;

  // Lado invertido vira retângulo do avesso, em vez de travar.
  if (width < 0) {
    x += width;
    width = -width;
  }
  if (height < 0) {
    y += height;
    height = -height;
  }

  return clampToPage({ x, y, width, height }, page);
}

/** O cursor que cada alça pede. Sai daqui para a tela não decidir por conta própria. */
export const CURSORS: Readonly<Record<Handle, string>> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  move: "move",
};

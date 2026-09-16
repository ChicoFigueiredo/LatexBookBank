import { centerX, type Rect } from "./geometry";
import type { TextLine } from "./page";

/**
 * As colunas de uma página, medidas nela (§10 e §11 do prompt 03).
 *
 * Nunca `largura / 2`. Um divisor candidato vem de evidência — o x onde um grupo de linhas começa,
 * ou a dica do perfil (no ENEM, o x dos cabeçalhos de questão) — e só vira coluna se a página
 * confirmar: linhas dos dois lados, e quase nenhuma atravessando a calha. O "quase" é o título
 * centrado, a tabela larga: até 5% das linhas, como no segmentador do TRI.
 *
 * Uma página de duas colunas no meio de um livro de uma, ou a página de uma coluna no meio de uma
 * prova de duas, sai do mesmo cálculo: a decisão é por página.
 */

export interface Column {
  readonly x0: number;
  readonly x1: number;
}

export interface ColumnOptions {
  /** Divisores sugeridos pelo perfil, em pontos. Conferidos como qualquer outro candidato. */
  readonly hints?: readonly number[];
}

/** Distância para dois inícios de linha serem "o mesmo x". */
const CLUSTER_TOLERANCE = 10;
const MIN_LINES_PER_CLUSTER = 3;
const MIN_LINES_PER_SIDE = 3;
/** A folga entre o divisor e o corte, e a margem da calha para "atravessar". */
const CUT_SLACK = 3;
const GUTTER_MARGIN = 8;
const MAX_CROSSING_FRACTION = 0.05;
/** O divisor precisa deixar pelo menos isto da largura útil de cada lado. */
const MIN_SIDE_FRACTION = 0.2;
const MAX_DEPTH = 3;

export function detectColumns(lines: readonly TextLine[], options: ColumnOptions = {}): Column[] {
  if (lines.length === 0) return [];
  const left = Math.min(...lines.map((line) => line.x0));
  const right = Math.max(...lines.map((line) => line.x1));

  return split(lines, left, right, options.hints ?? [], 0);
}

function split(
  lines: readonly TextLine[],
  left: number,
  right: number,
  hints: readonly number[],
  depth: number,
): Column[] {
  const whole = [{ x0: left, x1: right }];
  if (depth >= MAX_DEPTH || lines.length < MIN_LINES_PER_SIDE * 2) return whole;

  const span = right - left;
  const inside = (x: number) =>
    x > left + span * MIN_SIDE_FRACTION && x < right - span * MIN_SIDE_FRACTION;
  const candidates = [...new Set([...hints, ...clusterStarts(lines)])].filter(inside).sort((a, b) => a - b);

  let best: { divider: number; crossing: number; balance: number } | null = null;

  for (const divider of candidates) {
    const cut = divider - CUT_SLACK;
    const leftSide = lines.filter((line) => centerX(line) < cut);
    const rightSide = lines.filter((line) => centerX(line) >= cut);
    if (leftSide.length < MIN_LINES_PER_SIDE || rightSide.length < MIN_LINES_PER_SIDE) continue;

    const crossing = lines.filter(
      (line) => line.x0 < divider - GUTTER_MARGIN && line.x1 > divider + GUTTER_MARGIN,
    ).length;
    if (crossing > Math.max(1, Math.floor(lines.length * MAX_CROSSING_FRACTION))) continue;

    // Do lado direito, as linhas começam depois do corte: é o que distingue uma coluna de um
    // recuo que por acaso caiu no meio da página.
    const startsAfter = rightSide.filter((line) => line.x0 >= cut - 1).length / rightSide.length;
    if (startsAfter < 0.8) continue;

    const balance = Math.min(leftSide.length, rightSide.length) / Math.max(leftSide.length, rightSide.length);
    if (!best || crossing < best.crossing || (crossing === best.crossing && balance > best.balance)) {
      best = { divider, crossing, balance };
    }
  }

  if (!best) return whole;

  const cut = best.divider - CUT_SLACK;
  const leftLines = lines.filter((line) => centerX(line) < cut);
  const rightLines = lines.filter((line) => centerX(line) >= cut);

  return [
    ...split(leftLines, left, cut, hints, depth + 1),
    ...split(rightLines, cut, right, hints, depth + 1),
  ];
}

/** Os x onde começam grupos de pelo menos três linhas — exceto o grupo da margem esquerda. */
function clusterStarts(lines: readonly TextLine[]): number[] {
  const starts = lines.map((line) => line.x0).sort((a, b) => a - b);
  const groups: number[][] = [];

  for (const x of starts) {
    const group = groups[groups.length - 1];
    const last = group?.[group.length - 1];
    if (group && last !== undefined && x - last <= CLUSTER_TOLERANCE) group.push(x);
    else groups.push([x]);
  }

  return groups
    .filter((group) => group.length >= MIN_LINES_PER_CLUSTER)
    .slice(1)
    .map((group) => group[0] ?? 0);
}

/**
 * O divisor do documento pelos inícios das âncoras — a regra do TRI para provas.
 *
 * Os x das âncoras (cabeçalhos de questão) agrupados; com dois grupos de pelo menos três, o
 * divisor é o começo do segundo. Um vale de espaço em branco foi descartado lá por um motivo
 * medido: num caderno de 2018, um diagrama de química abriu um vão maior que a calha de verdade.
 */
export function dividerFromAnchors(anchorStarts: readonly number[]): number | null {
  const sorted = [...anchorStarts].sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const x of sorted) {
    const group = groups[groups.length - 1];
    const last = group?.[group.length - 1];
    if (group && last !== undefined && x - last <= CLUSTER_TOLERANCE) group.push(x);
    else groups.push([x]);
  }
  const strong = groups.filter((group) => group.length >= MIN_LINES_PER_CLUSTER);
  return strong.length >= 2 ? (strong[1]?.[0] ?? null) : null;
}

/** A coluna de um retângulo: a que contém o centro, ou a mais próxima quando cai na calha. */
export function columnOf(rect: Rect, columns: readonly Column[]): number {
  const cx = centerX(rect);
  let nearest = 0;
  let distance = Number.POSITIVE_INFINITY;

  columns.forEach((column, index) => {
    const d = cx < column.x0 ? column.x0 - cx : cx > column.x1 ? cx - column.x1 : 0;
    if (d < distance) {
      distance = d;
      nearest = index;
    }
  });

  return nearest;
}

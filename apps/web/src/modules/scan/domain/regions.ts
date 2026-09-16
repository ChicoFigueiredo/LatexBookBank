import type { DocLine, Position, ScanDocument } from "./document";
import { centerX, height, verticalCoverage, type Rect } from "./geometry";

/**
 * As regiões físicas de um elemento: tudo o que existe entre a âncora e o próximo limite, na
 * ordem de leitura, **sem** juntar colunas nem páginas num retângulo só (§5, §8 e §12 do prompt 03).
 *
 * Um segmento por vaga (página × coluna) que o elemento atravessa. Depois, cada segmento é
 * ajustado ao que tem dentro — texto, imagem, desenho —, como no segmentador do TRI: um recorte
 * do tamanho da coluna inteira, com dois terços em branco, ninguém quer conferir.
 */

export interface Segment {
  readonly pageNumber: number;
  readonly rect: Rect;
}

/** Quanto acima da âncora o segmento começa. */
const ANCHOR_SLACK = 3;
/**
 * Quanto antes do limite o segmento termina. Um ponto só: no PDF do INEP, a alternativa E acaba
 * exatamente onde o próximo cabeçalho começa, e com quatro pontos ela sumia do recorte.
 */
const END_SLACK = 1;
const MIN_SEGMENT_HEIGHT = 6;
/** A folga em volta do conteúdo, depois do ajuste. */
const CONTENT_MARGIN = 3;
/** Desenho menor que isto não sustenta um segmento sozinho: é fio decorativo. */
const MIN_STANDALONE_GRAPHIC = 30;
const COLUMN_TOLERANCE = 2;

export function segmentsBetween(
  doc: ScanDocument,
  start: Position,
  stop: Position | null,
  linesBySlot: ReadonlyMap<number, readonly DocLine[]> = indexBySlot(doc.lines),
): Segment[] {
  const segments: Segment[] = [];
  const lastSlot = stop ? stop.slot : doc.slots.length - 1;

  for (let s = start.slot; s <= lastSlot; s++) {
    const slot = doc.slots[s];
    if (!slot) continue;

    const top = s === start.slot ? start.y - ANCHOR_SLACK : slot.top - ANCHOR_SLACK;
    const bottom = stop && s === stop.slot ? stop.y - END_SLACK : slot.bottom + CONTENT_MARGIN;
    if (bottom - top < MIN_SEGMENT_HEIGHT) continue;

    const band: Rect = { x0: slot.column.x0, y0: top, x1: slot.column.x1, y1: bottom };
    const lines = (linesBySlot.get(s) ?? []).filter((line) => verticalCoverage(line, band) >= 0.5);
    const graphics = doc.graphics.filter(
      (graphic) =>
        graphic.pageNumber === slot.pageNumber &&
        centerX(graphic) >= slot.column.x0 - COLUMN_TOLERANCE &&
        centerX(graphic) <= slot.column.x1 + COLUMN_TOLERANCE &&
        verticalCoverage(graphic, band) >= 0.5,
    );

    const standalone = graphics.some((graphic) => height(graphic) >= MIN_STANDALONE_GRAPHIC);
    if (lines.length === 0 && !standalone) continue;

    const content: Rect[] = [...lines, ...graphics];
    let y0 = Math.max(top, Math.min(...content.map((r) => r.y0)) - CONTENT_MARGIN);
    let y1 = Math.min(bottom, Math.max(...content.map((r) => r.y1)) + CONTENT_MARGIN);
    if (y1 - y0 < MIN_SEGMENT_HEIGHT) {
      y0 = Math.max(top, y0 - 1);
      y1 = Math.min(bottom, y1 + 1);
    }

    // A largura é a da coluna — alargada para a figura que não cabe nela, mas nunca por cima do
    // texto da coluna vizinha na mesma altura.
    let x0 = Math.min(slot.column.x0, ...graphics.map((g) => g.x0), ...lines.map((l) => l.x0));
    let x1 = Math.max(slot.column.x1, ...graphics.map((g) => g.x1), ...lines.map((l) => l.x1));
    x0 = Math.max(x0, slot.pageLeft - CONTENT_MARGIN);
    x1 = Math.min(x1, slot.pageRight + CONTENT_MARGIN);

    for (const [otherSlot, others] of linesBySlot) {
      if (otherSlot === s || doc.slots[otherSlot]?.pageNumber !== slot.pageNumber) continue;
      for (const other of others) {
        if (other.y1 <= y0 || other.y0 >= y1) continue;
        if (other.x0 >= slot.column.x1) x1 = Math.min(x1, other.x0 - 1);
        else if (other.x1 <= slot.column.x0) x0 = Math.max(x0, other.x1 + 1);
      }
    }

    segments.push({ pageNumber: slot.pageNumber, rect: { x0, y0, x1, y1 } });
  }

  return segments;
}

/** Só as linhas dadas, por vaga — o título, que não carrega o que vem abaixo dele. */
export function segmentsOfLines(doc: ScanDocument, lines: readonly DocLine[]): Segment[] {
  const bySlot = indexBySlot(lines);
  const segments: Segment[] = [];

  for (const [s, group] of [...bySlot.entries()].sort((a, b) => a[0] - b[0])) {
    const slot = doc.slots[s];
    if (!slot || group.length === 0) continue;
    segments.push({
      pageNumber: slot.pageNumber,
      rect: {
        x0: Math.min(slot.column.x0, ...group.map((l) => l.x0)) - 1,
        y0: Math.min(...group.map((l) => l.y0)) - CONTENT_MARGIN,
        x1: Math.max(slot.column.x1, ...group.map((l) => l.x1)) + 1,
        y1: Math.max(...group.map((l) => l.y1)) + CONTENT_MARGIN,
      },
    });
  }

  return segments;
}

export function indexBySlot(lines: readonly DocLine[]): Map<number, DocLine[]> {
  const map = new Map<number, DocLine[]>();
  for (const line of lines) {
    const list = map.get(line.slot) ?? [];
    list.push(line);
    map.set(line.slot, list);
  }
  return map;
}

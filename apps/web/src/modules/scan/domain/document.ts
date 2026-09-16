import { detectFurniture, pageOffset, type Furniture } from "./furniture";
import type { Rect } from "./geometry";
import { columnOf, detectColumns, type Column } from "./layout";
import type { Graphic, PageModel, TextLine } from "./page";
import { readTableOfContents, type TableOfContents } from "./toc";
import { measureStyle, type PublicationStyle } from "./typography";

/**
 * O livro em ordem de leitura: página → coluna → altura (§10 do prompt 03).
 *
 * Cada par (página, coluna) é uma **vaga**, e as vagas formam uma lista única. Uma posição no
 * livro é (vaga, y): comparar duas posições é comparar esse par. É o que torna "atravessar a
 * coluna" e "atravessar a página" o mesmo caso — o elemento ocupa as vagas entre a âncora e o
 * próximo limite, sejam elas quantas forem.
 */

export interface Slot {
  readonly index: number;
  readonly pageNumber: number;
  readonly columnIndex: number;
  readonly columnCount: number;
  readonly column: Column;
  /** A mancha de conteúdo da página, sem a mobília. */
  readonly top: number;
  readonly bottom: number;
  /** As margens de conteúdo da página, para o alargamento de figura. */
  readonly pageLeft: number;
  readonly pageRight: number;
}

export interface DocLine extends TextLine {
  readonly slot: number;
  /** Posição na ordem de leitura do documento inteiro. */
  readonly order: number;
}

export interface DocGraphic extends Graphic {
  readonly pageNumber: number;
  readonly slot: number;
}

export interface Position {
  readonly slot: number;
  readonly y: number;
}

export interface ScanDocument {
  readonly pages: readonly PageModel[];
  readonly slots: readonly Slot[];
  /** Sem mobília e sem sumário, em ordem de leitura. */
  readonly lines: readonly DocLine[];
  readonly graphics: readonly DocGraphic[];
  readonly style: PublicationStyle;
  readonly furniture: Furniture;
  readonly toc: TableOfContents;
  /** PDF − impressa, medida pela mobília. O sumário pode refinar depois. */
  readonly pageOffset: number | null;
}

export interface AssembleOptions {
  /** Linhas que o perfil reconhece como âncora: protegidas da mobília. */
  readonly protect?: (line: TextLine, style: PublicationStyle) => boolean;
  /** Divisores de coluna sugeridos pelo perfil, a partir das linhas do documento. */
  readonly columnHints?: (lines: readonly TextLine[]) => readonly number[];
}

export function assembleDocument(pages: readonly PageModel[], options: AssembleOptions = {}): ScanDocument {
  const allLines = pages.flatMap((page) => page.lines);
  const style = measureStyle(allLines);
  const protect = options.protect;
  const furniture = detectFurniture(pages, {
    bodySize: style.bodySize,
    lineSpacing: style.lineSpacing,
    ...(protect ? { protect: (line: TextLine) => protect(line, style) } : {}),
  });
  const toc = readTableOfContents(pages);

  const content = (page: PageModel) =>
    page.lines.filter((line) => !furniture.lineIds.has(line.id) && !toc.pages.has(page.pageNumber));
  const hints = options.columnHints?.(pages.flatMap(content)) ?? [];

  const slots: Slot[] = [];
  const lines: Omit<DocLine, "order">[] = [];
  const graphics: DocGraphic[] = [];

  for (const page of pages) {
    const pageLines = content(page);
    const furnitureGraphics = furniture.graphics.get(page.pageNumber);
    const pageGraphics = toc.pages.has(page.pageNumber)
      ? []
      : page.graphics.filter((graphic, index) => !furnitureGraphics?.has(index) && !isColumnRule(graphic, page));

    const extent: Rect[] = [...pageLines, ...pageGraphics];
    if (extent.length === 0) continue;

    const columns = detectColumns(pageLines, { hints });
    const effective = columns.length > 0 ? columns : [bounds(extent)];
    const box = bounds(extent);
    const first = slots.length;

    effective.forEach((column, columnIndex) => {
      slots.push({
        index: first + columnIndex,
        pageNumber: page.pageNumber,
        columnIndex,
        columnCount: effective.length,
        column,
        top: box.y0,
        bottom: box.y1,
        pageLeft: box.x0,
        pageRight: box.x1,
      });
    });

    for (const line of pageLines) {
      lines.push({ ...line, slot: first + columnOf(line, effective) });
    }
    for (const graphic of pageGraphics) {
      graphics.push({ ...graphic, pageNumber: page.pageNumber, slot: first + columnOf(graphic, effective) });
    }
  }

  const ordered = lines
    .sort((a, b) => a.slot - b.slot || a.y0 - b.y0 || a.x0 - b.x0)
    .map((line, order) => ({ ...line, order }));

  return {
    pages,
    slots,
    lines: ordered,
    graphics,
    style,
    furniture,
    toc,
    pageOffset: pageOffset(furniture.printedPages),
  };
}

/**
 * O fio vertical entre colunas é layout, não conteúdo: fino e comprido. Deixá-lo como desenho faz
 * a região de toda questão ao lado dele descer até o pé da página.
 */
function isColumnRule(graphic: Graphic, page: PageModel): boolean {
  return graphic.kind === "drawing" && graphic.x1 - graphic.x0 <= 2 && graphic.y1 - graphic.y0 >= page.height * 0.3;
}

function bounds(rects: readonly Rect[]): Rect {
  return {
    x0: Math.min(...rects.map((r) => r.x0)),
    y0: Math.min(...rects.map((r) => r.y0)),
    x1: Math.max(...rects.map((r) => r.x1)),
    y1: Math.max(...rects.map((r) => r.y1)),
  };
}

export const positionOf = (line: DocLine): Position => ({ slot: line.slot, y: line.y0 });

export function comparePositions(a: Position, b: Position): number {
  return a.slot - b.slot || a.y - b.y;
}

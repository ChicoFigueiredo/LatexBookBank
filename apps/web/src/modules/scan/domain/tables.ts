import type { TextLine } from "./page";

/**
 * A tabela desenhada, lida pela camada de texto (D78).
 *
 * O *Fundamentos* imprime as tabelas-verdades numa moldura de traços, e o motor de figuras a
 * recortava como imagem: os V e os F que ela engolia como rótulos iam para o arquivo, e o livro
 * deixava de ser LaTeX ali. O modelo de visão transcreve a moldura como `tabular`, mas troca
 * célula — no vol. 1, p. 17, um V virou F na segunda linha. A camada de texto acerta cada célula,
 * com a posição: é dela a grade, e do reconhecimento só o que ela não lê (o ∧ do cabeçalho).
 */

/** O que separa duas células na mesma linha, em múltiplos do corpo: o dobro do espaço entre palavras (3 pt num corpo de 10). */
const CELL_GAP = 0.6;
/** Duas células com o centro mais perto que isto, em múltiplos do corpo, são da mesma coluna. */
const COLUMN_GAP = 1.5;
/** A grade tem de estar quase cheia: um diagrama com rótulos espalhados também tem linhas e colunas. */
const MIN_OCCUPANCY = 0.75;

interface Cell {
  readonly text: string;
  readonly center: number;
}

/** As células de uma linha: os trechos, partidos onde o espaço é de coluna e não de palavra. */
function cellsOf(line: TextLine): Cell[] {
  const spans = [...line.spans].filter((span) => span.text.trim() !== "").sort((a, b) => a.x0 - b.x0);
  const cells: { text: string; x0: number; x1: number }[] = [];
  for (const span of spans) {
    const last = cells.at(-1);
    if (last && span.x0 - last.x1 < span.size * CELL_GAP) {
      last.text = `${last.text} ${span.text.trim()}`;
      last.x1 = span.x1;
    } else {
      cells.push({ text: span.text.trim(), x0: span.x0, x1: span.x1 });
    }
  }
  return cells.map((cell) => ({ text: cell.text.replace(/\s+/g, " "), center: (cell.x0 + cell.x1) / 2 }));
}

/**
 * As linhas da tabela, cada uma com as células na ordem das colunas — ou `null`, quando o que a
 * figura engoliu não é uma grade: pelo menos três linhas, duas colunas, e quase cheia.
 */
export function tableRows(lines: readonly TextLine[]): string[][] | null {
  if (lines.length < 3) return null;
  const size = Math.max(...lines.map((line) => line.size));

  // As linhas da tabela: o que está na mesma altura, mesmo que a camada de texto o dê em pedaços.
  const sorted = [...lines].sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1));
  const rows: TextLine[][] = [];
  for (const line of sorted) {
    const middle = (line.y0 + line.y1) / 2;
    const row = rows.at(-1);
    const rowMiddle = row ? (row[0]!.y0 + row[0]!.y1) / 2 : Number.NEGATIVE_INFINITY;
    if (row && Math.abs(middle - rowMiddle) < size * 0.6) row.push(line);
    else rows.push([line]);
  }
  if (rows.length < 3) return null;

  const cellRows = rows.map((row) => row.flatMap(cellsOf).sort((a, b) => a.center - b.center));

  // As colunas: os centros das células, agrupados onde o salto passa de uma coluna.
  const centers = cellRows.flat().map((cell) => cell.center).sort((a, b) => a - b);
  const columns: number[][] = [];
  for (const center of centers) {
    const column = columns.at(-1);
    if (column && center - column.at(-1)! < size * COLUMN_GAP) column.push(center);
    else columns.push([center]);
  }
  if (columns.length < 2) return null;
  const middles = columns.map((column) => column.reduce((sum, x) => sum + x, 0) / column.length);
  const columnOf = (center: number) =>
    middles.reduce((best, middle, index) => (Math.abs(middle - center) < Math.abs(middles[best]! - center) ? index : best), 0);

  const grid = cellRows.map((cells) => {
    const row = middles.map(() => "");
    for (const cell of cells) {
      const index = columnOf(cell.center);
      row[index] = row[index] === "" ? cell.text : `${row[index]} ${cell.text}`;
    }
    return row;
  });

  const filled = grid.flat().filter((cell) => cell !== "").length;
  return filled / (grid.length * middles.length) >= MIN_OCCUPANCY ? grid : null;
}

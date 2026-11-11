import type { NormalizedBox } from "@/shared/geometry/normalized-box";

/**
 * O recorte que vai ao reconhecimento, em pedaços de poucas linhas (D78).
 *
 * O modelo de visão de 12B perde o detalhe num recorte grande: na p. 16 do *Fundamentos* vol. 1,
 * a página quase inteira saiu com "3/2 = 6" no lugar de "3/2 = 6/4", "4 < 3" no lugar de "4 ≤ 3"
 * e a tabela-verdade embaralhada — a 200, 300 e 400 dpi. Os mesmos trechos, recortados em blocos
 * de três linhas, saíram certos. A resolução não ajuda; o tamanho do recorte, sim.
 *
 * O corte só cai onde há espaço de sobra entre duas linhas — o fim de um parágrafo, o espaço entre
 * dois itens —, e nunca no meio de um parágrafo nem entre o numerador e a linha da fração.
 */

/** As linhas de texto do trecho, já na fração da página. */
export interface ChunkLine {
  readonly y0: number;
  readonly y1: number;
  readonly x0?: number;
  readonly x1?: number;
  /** O texto da camada do PDF — é contra ele que o pedaço reconhecido é conferido. */
  readonly text?: string;
}

/**
 * O texto que a camada do PDF tem dentro do pedaço, sem o que está debaixo das máscaras (as
 * figuras, que saem em branco do recorte).
 */
export function textInside(chunk: NormalizedBox, lines: readonly ChunkLine[], masks: readonly NormalizedBox[]): string {
  const within = (x: number, y: number, box: NormalizedBox) => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
  return lines
    .filter((line) => {
      const x = ((line.x0 ?? 0) + (line.x1 ?? 1)) / 2;
      const y = (line.y0 + line.y1) / 2;
      return within(x, y, chunk) && !masks.some((mask) => within(x, y, mask));
    })
    .map((line) => line.text ?? "")
    .join("\n");
}

export function chunkBoxes(
  region: NormalizedBox,
  lines: readonly ChunkLine[],
  options: { readonly maxHeight: number; readonly minGap: number },
): NormalizedBox[] {
  const top = region.y;
  const bottom = region.y + region.height;
  const inside = lines
    .filter((line) => (line.y0 + line.y1) / 2 >= top && (line.y0 + line.y1) / 2 <= bottom)
    .sort((a, b) => a.y0 - b.y0);
  if (inside.length === 0 || region.height <= options.maxHeight) return [region];

  // Onde dá para cortar: no meio do espaço entre uma linha e a seguinte, quando ele sobra.
  const cuts: number[] = [];
  let reach = inside[0]!.y1;
  for (const line of inside.slice(1)) {
    if (line.y0 - reach >= options.minGap) cuts.push((reach + line.y0) / 2);
    reach = Math.max(reach, line.y1);
  }

  // O corte mais baixo que ainda deixa o pedaço dentro da altura; se nenhum cabe, o primeiro que houver.
  const boxes: NormalizedBox[] = [];
  let start = top;
  while (bottom - start > options.maxHeight) {
    const fitting = cuts.filter((cut) => cut > start && cut - start <= options.maxHeight);
    const cut = fitting.at(-1) ?? cuts.find((candidate) => candidate > start);
    if (cut === undefined) break;
    boxes.push({ x: region.x, y: start, width: region.width, height: cut - start });
    start = cut;
  }
  boxes.push({ x: region.x, y: start, width: region.width, height: bottom - start });
  return boxes;
}

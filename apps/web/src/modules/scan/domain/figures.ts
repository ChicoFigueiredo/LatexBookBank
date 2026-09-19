import type { Rect } from "./geometry";

/**
 * A figura do livro, achada na página (D58, [ADR 0005](../../../../docs/adr/0005-figura-vetorial-quando-o-pdf-a-tem.md)).
 *
 * No PDF não existe "figura": existem traços soltos — dezenas deles num diagrama de Venn — e,
 * por cima, letras que são texto de verdade. Este módulo junta os traços que estão perto, decide
 * o que pertence à caixa e separa a legenda, que é do livro e vira `\caption`.
 *
 * Três decisões, e cada uma tem uma razão que o uso mostrou:
 *
 * - **Juntar com folga.** Dois pontos de um mesmo desenho podem estar a um centímetro um do
 *   outro; juntar só o que se toca partiria o diagrama ao meio.
 * - **Absorver o texto de dentro.** As letras `A`, `B`, `U` de um diagrama são spans do PDF.
 *   Deixá-las no fluxo enche o corpo do capítulo de sopa de letras, e a figura sai sem rótulo.
 * - **Legenda não é imagem.** "Figura 2.3 — Diagrama de Venn" fica **fora** do recorte: vira
 *   `\caption`, e quem numera de novo é o LaTeX.
 */

export type FigureKind = "vector" | "raster" | "mixed";

/** O que o módulo precisa saber de um traço ou imagem da página. */
export interface FigureGraphic extends Rect {
  readonly pageNumber: number;
  readonly slot: number;
  readonly kind: "drawing" | "image";
}

/** E de uma linha de texto — para saber se ela é rótulo de dentro, legenda, ou nada disso. */
export interface FigureLine extends Rect {
  readonly id: string;
  readonly pageNumber: number;
  readonly slot: number;
  readonly text: string;
  readonly mathRatio: number;
}

export interface FigureInput {
  readonly graphics: readonly FigureGraphic[];
  readonly lines: readonly FigureLine[];
  readonly bodySize: number;
  readonly lineSpacing: number;
}

export interface Figure {
  readonly pageNumber: number;
  readonly slot: number;
  readonly kind: FigureKind;
  /** O que a figura ocupa, sem folga — é o que decide o que está "dentro". */
  readonly box: Rect;
  /** O que vai para o arquivo: a caixa com uma folga, para o traço da borda não sair cortado. */
  readonly crop: Rect;
  /** Linhas engolidas pela figura: saem do fluxo do texto e vão junto no recorte. */
  readonly absorbedLineIds: readonly string[];
  /** O rótulo impresso — "Figura 2.3" —, que sobrevive como `originalLabel`. */
  readonly label: string | null;
  /** A legenda sem o rótulo. Vira `\caption`, e fica **fora** do recorte. */
  readonly caption: string | null;
  readonly captionLineIds: readonly string[];
}

/** Traços mais perto que isto, em múltiplos do corpo do texto, são a mesma figura. */
const CLUSTER_GAP = 1.6;
/** Abaixo disto, em pontos, não é figura: é fio, moldura de tabela, sublinhado. */
const MIN_SIDE = 18;
/** Fio decorativo: muito comprido e muito fino, em qualquer direção. */
const THIN_RATIO = 12;
/** A folga do recorte, em múltiplos do corpo. */
const CROP_PADDING = 0.4;
/** Quanto da linha precisa estar dentro da caixa para ela ser rótulo da figura. */
const INSIDE_RATIO = 0.7;
/**
 * Rótulo de figura é **curto**: `A`, `B`, `x₀`, `f(x)`, `Figura 3`. Uma frase dentro da caixa não
 * é rótulo — é sinal de que a caixa cresceu demais e está prestes a comer um parágrafo.
 *
 * Medido no *Fundamentos de Matemática Elementar*, que tem figura em metade das páginas: sem este
 * limite, 184 figuras engoliam 763 linhas em 100 páginas. Com ele, some o que era texto do livro.
 */
const LABEL_CHARS = 16;

const CAPTION = /^\s*(fig(?:ura|\.)?|gr[áa]fico|esquema|quadro|diagrama)\s*([\dIVXLC]+(?:[.\-]\d+)*)\s*[-–—.:)]?\s*(.*)$/i;

const width = (rect: Rect): number => rect.x1 - rect.x0;
const height = (rect: Rect): number => rect.y1 - rect.y0;

const merge = (a: Rect, b: Rect): Rect => ({
  x0: Math.min(a.x0, b.x0),
  y0: Math.min(a.y0, b.y0),
  x1: Math.max(a.x1, b.x1),
  y1: Math.max(a.y1, b.y1),
});

/** Distância entre duas caixas: zero quando se tocam ou se sobrepõem. */
function distance(a: Rect, b: Rect): number {
  const dx = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1));
  const dy = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
  return Math.hypot(dx, dy);
}

/** Quanto da caixa `inner` está dentro de `outer`, de 0 a 1. */
function insideRatio(inner: Rect, outer: Rect): number {
  const w = Math.max(0, Math.min(inner.x1, outer.x1) - Math.max(inner.x0, outer.x0));
  const h = Math.max(0, Math.min(inner.y1, outer.y1) - Math.max(inner.y0, outer.y0));
  const area = width(inner) * height(inner);
  return area <= 0 ? 0 : (w * h) / area;
}

const isDecoration = (rect: Rect): boolean => {
  const w = width(rect);
  const h = height(rect);
  if (w < MIN_SIDE && h < MIN_SIDE) return true;
  // Fio: um lado dezenas de vezes maior que o outro. É régua, sublinhado ou borda de tabela.
  return (w > h * THIN_RATIO && h < MIN_SIDE) || (h > w * THIN_RATIO && w < MIN_SIDE);
};

/**
 * Quanto da caixa pode ser texto antes de ela deixar de ser figura.
 *
 * Medido no *Fundamentos de Matemática Elementar*: o livro emoldura definições e fórmulas com um
 * retângulo, e a moldura é um traço como qualquer outro. Sem esta regra, cada moldura virava
 * figura — 184 em 100 páginas —, e o texto emoldurado ia junto para dentro de uma imagem.
 *
 * O que separa moldura de desenho é a densidade: um diagrama tem muitos traços e pouco texto;
 * uma moldura tem um traço e um parágrafo dentro.
 */
const FRAME_TEXT_COVERAGE = 0.12;
const FRAME_MAX_STROKES = 2;
/** Duas linhas de texto de verdade — não rótulos — já denunciam uma moldura. */
const FRAME_TEXT_LINES = 2;

interface Cluster {
  box: Rect;
  kinds: Set<"drawing" | "image">;
  strokes: number;
  readonly pageNumber: number;
  readonly slot: number;
}

function cluster(graphics: readonly FigureGraphic[], gap: number): Cluster[] {
  const clusters: Cluster[] = [];

  for (const graphic of graphics) {
    // Um traço pode ligar dois grupos que ainda não se conheciam: junta-se a todos que alcança.
    const reached = clusters.filter(
      (candidate) =>
        candidate.pageNumber === graphic.pageNumber &&
        candidate.slot === graphic.slot &&
        distance(candidate.box, graphic) <= gap,
    );

    if (reached.length === 0) {
      clusters.push({
        box: { x0: graphic.x0, y0: graphic.y0, x1: graphic.x1, y1: graphic.y1 },
        kinds: new Set([graphic.kind]),
        strokes: 1,
        pageNumber: graphic.pageNumber,
        slot: graphic.slot,
      });
      continue;
    }

    const first = reached[0]!;
    first.box = merge(first.box, graphic);
    first.kinds.add(graphic.kind);
    first.strokes += 1;
    for (const other of reached.slice(1)) {
      first.box = merge(first.box, other.box);
      first.strokes += other.strokes;
      for (const kind of other.kinds) first.kinds.add(kind);
      clusters.splice(clusters.indexOf(other), 1);
    }
  }

  return clusters;
}

const kindOf = (kinds: ReadonlySet<"drawing" | "image">): FigureKind =>
  kinds.size > 1 ? "mixed" : kinds.has("image") ? "raster" : "vector";

export function findFigures(input: FigureInput): readonly Figure[] {
  const gap = input.bodySize * CLUSTER_GAP;
  const padding = input.bodySize * CROP_PADDING;

  const figures: Figure[] = [];
  for (const group of cluster(input.graphics, gap)) {
    if (isDecoration(group.box)) continue;

    const sameColumn = input.lines.filter(
      (line) => line.pageNumber === group.pageNumber && line.slot === group.slot,
    );

    // Moldura em volta de texto não é figura: o que está dentro dela é texto do livro, e continua
    // sendo texto. Só o desenho com poucos traços é suspeito — um diagrama tem dezenas.
    if (group.kinds.has("drawing") && group.strokes <= FRAME_MAX_STROKES) {
      const inside = sameColumn.filter((line) => insideRatio(line, group.box) >= 0.6);
      const area = width(group.box) * height(group.box);
      const inked = inside.reduce((sum, line) => sum + width(line) * height(line), 0);
      // Duas medidas, porque uma só não pega os dois casos: a tarja do "EXERCÍCIOS" é uma linha
      // gorda num retângulo baixo (cobertura alta), e a moldura de uma página inteira é texto
      // miúdo num retângulo enorme (cobertura baixa, muitas linhas).
      const textLines = inside.filter((line) => line.text.trim().length > LABEL_CHARS).length;
      if ((area > 0 && inked / area > FRAME_TEXT_COVERAGE) || textLines >= FRAME_TEXT_LINES) continue;
    }

    /*
      Absorver e crescer, até parar de crescer.

      Uma letra na borda do diagrama só está "dentro" depois que a caixa cresceu para pegar a
      anterior. Duas passadas bastam no acervo real, mas o laço é o que garante o caso do
      desenho com rótulos em cascata.
    */
    let box = group.box;
    const absorbed = new Set<string>();
    for (let round = 0; round < 4; round++) {
      const novas = sameColumn.filter(
        (line) =>
          !absorbed.has(line.id) &&
          line.text.trim().length <= LABEL_CHARS &&
          insideRatio(line, box) >= INSIDE_RATIO,
      );
      if (novas.length === 0) break;
      for (const line of novas) {
        absorbed.add(line.id);
        box = merge(box, line);
      }
    }

    // A legenda: logo abaixo da figura, começando com a palavra que o livro usa.
    const captionLimit = box.y1 + input.lineSpacing * 1.8;
    const candidate = sameColumn
      .filter((line) => !absorbed.has(line.id) && line.y0 >= box.y1 - 1 && line.y0 <= captionLimit)
      .sort((a, b) => a.y0 - b.y0)[0];
    const match = candidate ? CAPTION.exec(candidate.text) : null;

    figures.push({
      pageNumber: group.pageNumber,
      slot: group.slot,
      kind: kindOf(group.kinds),
      box,
      crop: { x0: box.x0 - padding, y0: box.y0 - padding, x1: box.x1 + padding, y1: box.y1 + padding },
      absorbedLineIds: [...absorbed],
      label: match ? `${match[1]![0]!.toUpperCase()}${match[1]!.slice(1).replace(/\.$/, "")} ${match[2]}`.trim() : null,
      caption: match ? (match[3]?.trim() || null) : null,
      captionLineIds: match && candidate ? [candidate.id] : [],
    });
  }

  return figures.sort((a, b) => a.pageNumber - b.pageNumber || a.slot - b.slot || a.box.y0 - b.box.y0);
}

import type { Graphic, PageModel, TextLine } from "./page";
import { median } from "./geometry";
import { shapeOf } from "./text";

/**
 * Mobília: o que se repete nas páginas sem ser conteúdo — cabeçalho corrido, número de página,
 * código de barras, nome do livro (§20 do prompt 03).
 *
 * Duas regras, da mais forte para a mais fraca, e as duas herdadas do segmentador do TRI:
 *
 * 1. **Na faixa de margem** (a primeira e a última linha da página, separadas do corpo por um vão
 *    maior que o normal), basta a **posição** se repetir: o cabeçalho de livro muda de texto a cada
 *    capítulo, mas não de lugar. O número de página solto na margem é mobília mesmo sem repetir.
 * 2. **Em qualquer lugar**, a mesma **forma** de texto (sem acento, dígitos como `#`) no mesmo
 *    lugar em muitas páginas: marca d'água, aviso de direitos.
 *
 * Linha que o perfil reconhece como âncora é protegida: senão "QUESTÃO 94" e "QUESTÃO 108", na
 * mesma posição de páginas diferentes, seriam a mesma mobília e sumiriam.
 */

export interface FurnitureOptions {
  /** `true` para linhas que o perfil considera âncora — nunca viram mobília. */
  readonly protect?: (line: TextLine) => boolean;
  /**
   * O corpo do texto do livro. Linha maior que ele não é mobília: título de capítulo em 24 pt,
   * sozinho no alto da página e na mesma posição em todo capítulo, parece cabeçalho corrido por
   * posição — e cabeçalho corrido nunca é maior que o texto.
   */
  readonly bodySize?: number;
  /** A entrelinha do documento. Medida por página, ela mente em página esparsa. */
  readonly lineSpacing?: number;
}

export interface Furniture {
  readonly lineIds: ReadonlySet<string>;
  /** Por página, os índices de `graphics` que são mobília (fio de cabeçalho, logotipo). */
  readonly graphics: ReadonlyMap<number, ReadonlySet<number>>;
  /** O número impresso de cada página, quando a mobília o mostra. */
  readonly printedPages: ReadonlyMap<number, string>;
}

const POSITION_STEP = 5;
/** Quantas linhas de cada ponta da página podem ser cabeçalho ou rodapé. */
const BAND_LINES = 2;
/** O vão, em entrelinhas típicas, que separa a faixa de margem do corpo. */
const BAND_GAP = 1.5;
/** Faixa fixa de segurança, em fração da altura, para páginas com uma linha só na ponta. */
const BAND_FRACTION = 0.06;

const PAGE_NUMBER = /^(?:p[áa]gina\s+)?(\d{1,4}|[ivxlcdm]{1,7})$/i;
const TRAILING_NUMBER = /(?:^|\s)(\d{1,4})$/;
const LEADING_NUMBER = /^(\d{1,4})(?:\s|$)/;

export function detectFurniture(pages: readonly PageModel[], options: FurnitureOptions = {}): Furniture {
  const protect = options.protect ?? (() => false);
  const textPages = pages.filter((page) => page.lines.length > 0);
  const bandRepeats = Math.max(2, Math.ceil(textPages.length * 0.25));
  const anywhereRepeats = Math.max(3, Math.floor(textPages.length * 0.4));

  const lineIds = new Set<string>();
  const printedPages = new Map<number, string>();

  // Regra 1 — faixa de margem.
  const bandCandidates: { line: TextLine; band: "top" | "bottom"; page: number }[] = [];
  for (const page of textPages) {
    for (const [line, band] of bandLines(page, options.lineSpacing)) {
      bandCandidates.push({ line, band, page: page.pageNumber });
    }
  }

  const tooLarge = (line: TextLine) =>
    options.bodySize !== undefined && line.size > options.bodySize * 1.1;

  for (const candidate of bandCandidates) {
    if (protect(candidate.line) || tooLarge(candidate.line)) continue;
    const { line } = candidate;

    const pagesAligned = new Set(
      bandCandidates
        .filter(
          (other) =>
            other.band === candidate.band &&
            Math.abs(other.line.y0 - line.y0) <= POSITION_STEP &&
            (Math.abs(other.line.x0 - line.x0) <= POSITION_STEP ||
              Math.abs(other.line.x1 - line.x1) <= POSITION_STEP),
        )
        .map((other) => other.page),
    );

    const isPageNumber = PAGE_NUMBER.test(line.text) || /p[áa]gina\s+\d+/i.test(line.text);
    if (pagesAligned.size >= bandRepeats || isPageNumber) {
      lineIds.add(line.id);
      const printed = printedNumber(line.text);
      if (printed !== null && !printedPages.has(candidate.page)) {
        printedPages.set(candidate.page, printed);
      }
    }
  }

  // Regra 2 — mesma forma, mesmo lugar, muitas páginas.
  if (textPages.length >= anywhereRepeats) {
    const bySignature = new Map<string, { ids: string[]; pages: Set<number> }>();
    for (const page of textPages) {
      for (const line of page.lines) {
        if (protect(line) || tooLarge(line)) continue;
        const key = `${Math.floor(line.x0 / POSITION_STEP)}|${Math.floor(line.y0 / POSITION_STEP)}|${shapeOf(line.text)}`;
        const entry = bySignature.get(key) ?? { ids: [], pages: new Set<number>() };
        entry.ids.push(line.id);
        entry.pages.add(page.pageNumber);
        bySignature.set(key, entry);
      }
    }
    for (const entry of bySignature.values()) {
      if (entry.pages.size >= anywhereRepeats) entry.ids.forEach((id) => lineIds.add(id));
    }
  }

  return { lineIds, graphics: furnitureGraphics(pages, bandRepeats), printedPages };
}

/** As linhas das pontas da página que estão separadas do corpo — candidatas a mobília. */
function bandLines(page: PageModel, lineSpacing: number | undefined): [TextLine, "top" | "bottom"][] {
  const lines = [...page.lines].sort((a, b) => a.y0 - b.y0);
  const gaps = lines.slice(1).map((line, i) => line.y0 - (lines[i]?.y0 ?? line.y0));
  const spacing = lineSpacing ?? (median(gaps.filter((gap) => gap > 1)) || 12);
  const found: [TextLine, "top" | "bottom"][] = [];

  const scan = (ordered: TextLine[], band: "top" | "bottom") => {
    for (let i = 0; i < Math.min(BAND_LINES, ordered.length - 1); i++) {
      const line = ordered[i];
      const next = ordered[i + 1];
      if (!line || !next) break;
      const gap = Math.abs(next.y0 - line.y0);
      const nearEdge =
        band === "top"
          ? line.y1 <= page.height * BAND_FRACTION
          : line.y0 >= page.height * (1 - BAND_FRACTION);
      if (gap > spacing * BAND_GAP || nearEdge) {
        // Tudo até aqui é faixa: o cabeçalho de duas linhas entra inteiro.
        for (let j = 0; j <= i; j++) {
          const banded = ordered[j];
          if (banded) found.push([banded, band]);
        }
      }
    }
  };

  scan(lines, "top");
  scan([...lines].reverse(), "bottom");

  // Uma linha pode ter entrado duas vezes (página de uma linha só); a primeira faixa vale.
  const seen = new Set<string>();
  return found.filter(([line]) => (seen.has(line.id) ? false : (seen.add(line.id), true)));
}

function printedNumber(text: string): string | null {
  const own = PAGE_NUMBER.exec(text.trim());
  if (own?.[1]) return own[1];
  const labeled = /p[áa]gina\s+(\d{1,4})/i.exec(text);
  if (labeled?.[1]) return labeled[1];
  // Cabeçalho corrido com o número numa das pontas: "CAPÍTULO 1. NÚMEROS REAIS 3".
  const trailing = TRAILING_NUMBER.exec(text.trim());
  if (trailing?.[1]) return trailing[1];
  const leading = LEADING_NUMBER.exec(text.trim());
  return leading?.[1] ?? null;
}

function furnitureGraphics(
  pages: readonly PageModel[],
  repeats: number,
): ReadonlyMap<number, ReadonlySet<number>> {
  const signature = (g: Graphic) =>
    [g.kind, g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0]
      .map((v) => (typeof v === "number" ? Math.floor(v / POSITION_STEP) : v))
      .join("|");

  const counts = new Map<string, Set<number>>();
  for (const page of pages) {
    for (const graphic of page.graphics) {
      const key = signature(graphic);
      const set = counts.get(key) ?? new Set<number>();
      set.add(page.pageNumber);
      counts.set(key, set);
    }
  }

  const result = new Map<number, Set<number>>();
  for (const page of pages) {
    page.graphics.forEach((graphic, index) => {
      const repeated = (counts.get(signature(graphic))?.size ?? 0) >= repeats;
      // Só na margem: um desenho repetido no meio da página (o mesmo eixo em três questões) é
      // conteúdo de cada uma.
      const inMargin =
        graphic.y1 <= page.height * 0.1 || graphic.y0 >= page.height * 0.9;
      if (repeated && inMargin) {
        const set = result.get(page.pageNumber) ?? new Set<number>();
        set.add(index);
        result.set(page.pageNumber, set);
      }
    });
  }
  return result;
}

/**
 * A diferença entre a página do PDF e a impressa — "o sumário diz 132, o scan achou na 145" (§19).
 * A moda das diferenças, e só quando pelo menos duas páginas concordam.
 */
export function pageOffset(printedPages: ReadonlyMap<number, string>): number | null {
  const counts = new Map<number, number>();
  for (const [pdfPage, printed] of printedPages) {
    const value = Number.parseInt(printed, 10);
    if (!Number.isInteger(value)) continue;
    const offset = pdfPage - value;
    counts.set(offset, (counts.get(offset) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 2 ? best[0] : null;
}

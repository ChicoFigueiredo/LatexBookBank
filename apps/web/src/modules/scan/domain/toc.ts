import type { PageModel } from "./page";
import type { ScanKind } from "./proposal";
import { romanToNumber, stripAccents } from "./text";

/**
 * O sumário como expectativa, não como verdade (§19 do prompt 03).
 *
 * Duas utilidades: tirar as páginas do sumário do caminho — "1.1 Ordem ....... 2" tem exatamente a
 * cara de um título de seção — e dizer ao scan o que ele deveria encontrar, e em que página
 * impressa. Quando o scan acha "Capítulo 7" na página 145 do PDF e o sumário diz 132, a diferença é
 * o deslocamento editorial das páginas.
 */

export interface TocEntry {
  readonly kind: ScanKind;
  readonly number: string | null;
  readonly title: string;
  readonly printedPage: number;
}

export interface TableOfContents {
  readonly pages: ReadonlySet<number>;
  readonly entries: readonly TocEntry[];
}

const TOC_TITLE = /^(sum[áa]rio|[íi]ndice(\s+geral)?|conte[úu]do|contents|table of contents)$/i;
const ENTRY = /^(.*?\S)(?:\s*[.·…]{2,}\s*|\s+)(\d{1,4})$/u;
/** Um sumário tem entradas: menos do que isto numa página é coincidência. */
const MIN_ENTRIES = 4;

export function readTableOfContents(pages: readonly PageModel[]): TableOfContents {
  const tocPages = new Set<number>();
  const entries: TocEntry[] = [];
  let inToc = false;

  for (const page of pages) {
    const titled = page.lines.some((line) => TOC_TITLE.test(line.text.trim()));
    const parsed = joinPageNumbers(page)
      .map((text) => ENTRY.exec(text))
      .filter((match): match is RegExpExecArray => match !== null);
    const dense = parsed.length >= MIN_ENTRIES && parsed.length >= page.lines.length * 0.5;

    // O sumário começa numa página com título e continua enquanto as páginas seguintes forem
    // listas de entradas; a primeira página que não é lista o encerra.
    if (titled && parsed.length >= MIN_ENTRIES) inToc = true;
    else if (!(inToc && dense)) inToc = false;
    if (!inToc) continue;

    tocPages.add(page.pageNumber);
    for (const match of parsed) {
      const entry = toEntry(match[1] ?? "", Number.parseInt(match[2] ?? "", 10));
      if (entry) entries.push(entry);
    }
  }

  return { pages: tocPages, entries };
}

/**
 * O texto das linhas, com o número de página de volta ao fim da entrada. Sem pontilhado — é como o
 * LaTeX compõe a entrada de capítulo —, o número fica longe o bastante para ser outra linha.
 */
function joinPageNumbers(page: PageModel): string[] {
  const numbers = page.lines.filter((line) => /^\d{1,4}$/.test(line.text.trim()));
  const used = new Set<string>();

  return page.lines
    .filter((line) => !numbers.includes(line))
    .map((line) => {
      const text = line.text.trim();
      if (/\d$/.test(text)) return text;
      const number = numbers.find(
        (candidate) =>
          !used.has(candidate.id) && Math.abs(candidate.y0 - line.y0) <= 2 && candidate.x0 > line.x1,
      );
      if (!number) return text;
      used.add(number.id);
      return `${text} ${number.text.trim()}`;
    });
}

function toEntry(label: string, printedPage: number): TocEntry | null {
  const text = label.trim();
  const folded = stripAccents(text);

  const part = /^(?:parte|part)\s+([ivxlc]+|\d+)\b\.?\s*(.*)$/i.exec(folded);
  if (part) return { kind: "PART", number: normalizeNumber(part[1] ?? ""), title: tail(text, part[2]), printedPage };

  const chapterWord = /^(?:cap[ií]tulo|chapter)\s+(\d+)\b\.?\s*(.*)$/i.exec(folded);
  if (chapterWord) {
    return { kind: "CHAPTER", number: chapterWord[1] ?? null, title: tail(text, chapterWord[2]), printedPage };
  }

  const numbered = /^(\d+(?:\.\d+)*)\.?\s+(.*)$/.exec(text);
  if (numbered) {
    const depth = (numbered[1] ?? "").split(".").length;
    const kind: ScanKind = depth === 1 ? "CHAPTER" : depth === 2 ? "SECTION" : "SUBSECTION";
    return { kind, number: numbered[1] ?? null, title: numbered[2] ?? "", printedPage };
  }

  // "I Fundamentos": parte numerada em romano sem a palavra.
  const roman = /^([IVXLC]+)\s+(\S.*)$/.exec(text);
  if (roman && romanToNumber(roman[1] ?? "") !== null) {
    return { kind: "PART", number: normalizeNumber(roman[1] ?? ""), title: roman[2] ?? "", printedPage };
  }

  return null;
}

function tail(original: string, foldedTail: string | undefined): string {
  if (!foldedTail) return "";
  return original.slice(original.length - foldedTail.length).trim();
}

/** Romano e arábico no mesmo formato: a parte "II" do sumário é a parte "2" do corpo. */
export function normalizeNumber(value: string): string {
  const roman = romanToNumber(value);
  return roman !== null ? String(roman) : value;
}

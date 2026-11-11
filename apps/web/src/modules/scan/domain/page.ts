import { wordFromBaseline, type TextPage } from "@/shared/pdf-text/text-layer";

import { fontTraits, looksLikeMath } from "./fonts";
import { median, type Rect } from "./geometry";
import { composeSpacingAccents, endsWithSpacingAccent, isSpacingAccent } from "./text";

/**
 * O modelo de uma página, independente de tela e de biblioteca de PDF (Fase 2 do prompt 03).
 *
 * O leitor (`infrastructure/pdfjs-document-reader.ts`) entrega **trechos** na ordem do conteúdo,
 * como o pdf.js os devolve; este arquivo os junta em **linhas**. A linha — e não o bloco — é a
 * unidade de âncora: no segmentador do TRI, o bloco juntava "Questão 176" com as alternativas da
 * 175, e o recorte começava 87 pt acima do lugar.
 */

/** Um trecho de texto como o leitor o viu. Coordenadas em pontos, topo-esquerda. */
export interface RawSpan {
  readonly text: string;
  readonly x0: number;
  readonly x1: number;
  /** A linha de base. O topo e a base da caixa derivam dela e do corpo da fonte. */
  readonly baseline: number;
  readonly size: number;
  readonly fontName: string;
  /** O leitor diz que a linha acaba aqui (`hasEOL` do pdf.js). */
  readonly endsLine: boolean;
}

export type GraphicKind = "image" | "drawing";

export interface Graphic extends Rect {
  readonly kind: GraphicKind;
}

/** A página crua, como sai do leitor e como é guardada no cache da execução (`ScanPage`). */
export interface RawPage {
  readonly pageNumber: number;
  readonly width: number;
  readonly height: number;
  readonly spans: readonly RawSpan[];
  readonly graphics: readonly Graphic[];
}

export interface TextSpan extends Rect {
  readonly text: string;
  /**
   * A linha de base, como o leitor a deu. A caixa (`y0`/`y1`) deriva dela pela métrica abaixo, e
   * a métrica muda com a fonte — quem precisa da base a lê aqui, sem desfazer a conta.
   */
  readonly baseline: number;
  readonly size: number;
  readonly fontName: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly math: boolean;
}

export interface TextLine extends Rect {
  /** `p<página>-l<índice>`: estável dentro da execução, é o que o diagnóstico cita. */
  readonly id: string;
  readonly pageNumber: number;
  /** Em NFC — ver `buildLines`. */
  readonly text: string;
  readonly spans: readonly TextSpan[];
  /** Corpo típico da linha, ponderado pelo número de caracteres. */
  readonly size: number;
  readonly fontName: string;
  readonly bold: boolean;
  readonly italic: boolean;
  /** Fração dos caracteres que são matemática (fonte ou símbolo). */
  readonly mathRatio: number;
}

export interface PageModel {
  readonly pageNumber: number;
  readonly width: number;
  readonly height: number;
  readonly lines: readonly TextLine[];
  readonly graphics: readonly Graphic[];
  /** Página sem camada de texto — digitalizada, e candidata a OCR. */
  readonly scanned: boolean;
}

/** Quanto do corpo fica acima da linha de base. O resto, abaixo, é descendente. */
const ASCENT = 0.8;
const DESCENT = 0.22;

const SYMBOLIC = /^[\d+\-−=()[\]{}.,;:<>|/*^_'·]+$/u;

/** O vão horizontal, em corpos, a partir do qual dois trechos na mesma altura são linhas distintas. */
const MAX_GAP_IN_LINE = 2.5;

/**
 * A fonte de extensão do TeX (parênteses e chaves grandes, ∑ e ∫ de display) desenha o glifo
 * **pendurado abaixo** da linha de base. Com a caixa das outras fontes, o parêntese de uma matriz
 * inline ficaria acima da linha dele e a partiria em três.
 */
const EXTENSION_FONT = /extension|^cmex/i;
const EXTENSION_DESCENT = 2.6;

/**
 * O NUL que a fonte entrega no lugar de um símbolo — o "<" do *Fundamentos* vol. 1 — vira um
 * caractere da área privada: continua ilegível para o motor (`UNREADABLE_CHAR`), e o banco não corta
 * o texto nele. Com o NUL, o item da p. 272 guardava só até "g(x) ".
 */
const NUL = /\u0000/g;
const NUL_STAND_IN = "";

/**
 * A fonte de símbolos que entrega o glifo com o código de uma letra ou dígito. No vol. 7 do
 * *Fundamentos*, a MathematicalPi-One dava "=" como "5", "−" como "2" e "+" como "1": "P(t) =
 * 2(1 − t) + 8t" saía "P(t) 5 2(1 2 t) 1 8t", o texto parecia legível, e o item não ia ao modelo.
 * Fonte de símbolos não tem dígito de verdade: o ASCII dela é símbolo ilegível, como o NUL. O que
 * ela já entrega em Unicode ("∈") fica. A `Symbol` não entra — nela "(", "+" e "=" são os de verdade.
 */
const SYMBOL_PI_FONT = /MathematicalPi/i;
const ASCII = /[!-~]/g;

export function toTextSpan(raw: RawSpan): TextSpan {
  const traits = fontTraits(raw.fontName);
  const normalized = raw.text.normalize("NFC").replace(NUL, NUL_STAND_IN);
  const text = SYMBOL_PI_FONT.test(raw.fontName)
    ? normalized.replace(ASCII, NUL_STAND_IN)
    : normalized;
  const hanging = EXTENSION_FONT.test(traits.family);

  return {
    text,
    baseline: raw.baseline,
    x0: raw.x0,
    x1: raw.x1,
    y0: hanging ? raw.baseline : raw.baseline - raw.size * ASCENT,
    y1: raw.baseline + raw.size * (hanging ? EXTENSION_DESCENT : DESCENT),
    size: raw.size,
    fontName: traits.family,
    bold: traits.bold,
    italic: traits.italic,
    math: traits.math || looksLikeMath(text),
  };
}

/**
 * Junta os trechos em linhas, na ordem em que o conteúdo os traz.
 *
 * A ordem do conteúdo é a pista mais barata e a mais confiável: o LaTeX, o InDesign e o Word
 * escrevem uma coluna inteira antes da outra, e o pdf.js marca o fim de cada linha. Por isso dois
 * trechos na mesma altura mas em colunas diferentes **não** viram uma linha — entre eles houve um
 * fim de linha, ou o x voltou para trás, ou o vão é maior que dois corpos e meio (a calha).
 *
 * Um trecho entra na linha corrente quando a sobrepõe na vertical: é o que junta o expoente e a
 * fração à linha deles, em vez de criar uma linha de um caractere.
 *
 * NFC em tudo: o PDF do LaTeX entrega acento decomposto, e uma regex com "ç" não casa com "c" +
 * cedilha — falha em silêncio (ver `segment-page.ts`).
 */
export function buildLines(page: RawPage): PageModel {
  const lines: TextLine[] = [];
  let current: TextSpan[] = [];
  let bounds: Rect | null = null;

  const close = () => {
    if (current.length > 0 && bounds) {
      lines.push(makeLine(page.pageNumber, lines.length, current, bounds));
    }
    current = [];
    bounds = null;
  };

  // O fim de linha do pdf.js fica **pendente** até o próximo trecho: numa fração ou numa matriz
  // inline ele aparece no meio da fórmula, e o trecho seguinte continua à direita, na mesma
  // altura. Só quebra de verdade quando o próximo trecho não continua a linha.
  let pendingBreak = false;
  let lastSpan: TextSpan | null = null;

  for (const raw of page.spans) {
    const blank = raw.text.trim() === "";

    if (blank) {
      // O item vazio com fim de linha é como o pdf.js marca a quebra; o espaço solto não tem
      // geometria útil — a largura dele é o vão, que a junção do texto já reconstrói.
      if (raw.endsLine) pendingBreak = true;
      continue;
    }

    const span = toTextSpan(raw);
    if (bounds) {
      // O acento solto do TeX antigo fica em cima da letra seguinte: o trecho depois dele começa
      // "para trás", e isso não é outra linha.
      const afterAccent =
        overlapsVertically(bounds, span) &&
        ((lastSpan !== null && endsWithSpacingAccent(lastSpan.text)) ||
          isSpacingAccent(span.text.trim().charAt(0)));
      const continues =
        afterAccent ||
        (pendingBreak ? continuesToTheRight(bounds, span) : continuesLine(bounds, span));
      if (!continues) close();
    }
    pendingBreak = false;
    lastSpan = span;

    current.push(span);
    bounds = bounds
      ? {
          x0: Math.min(bounds.x0, span.x0),
          y0: Math.min(bounds.y0, span.y0),
          x1: Math.max(bounds.x1, span.x1),
          y1: Math.max(bounds.y1, span.y1),
        }
      : span;

    if (raw.endsLine) pendingBreak = true;
  }
  close();

  const merged = mergeFragments(lines).map((line, index) =>
    makeLine(page.pageNumber, index, line.spans, line),
  );

  return {
    pageNumber: page.pageNumber,
    width: page.width,
    height: page.height,
    lines: merged,
    graphics: page.graphics,
    scanned: lines.length === 0 && page.graphics.some((g) => g.kind === "image"),
  };
}

function overlapsVertically(line: Rect, span: TextSpan): boolean {
  return Math.min(line.y1, span.y1) - Math.max(line.y0, span.y0) > 0;
}

function continuesLine(line: Rect, span: TextSpan): boolean {
  const overlap = Math.min(line.y1, span.y1) - Math.max(line.y0, span.y0);
  if (overlap <= 0) return false;

  const gap = span.x0 - line.x1;
  // Um pouco para trás é kerning ou acento sobreposto; muito para trás é outra linha.
  if (gap < -span.size * 0.5) return false;

  return gap <= span.size * MAX_GAP_IN_LINE;
}

/** Um fragmento: pedaço curto de fórmula que o PDF escreveu fora da ordem da linha. */
const FRAGMENT_MAX_CHARS = 20;

function isFragment(line: TextLine): boolean {
  if (line.text.length > FRAGMENT_MAX_CHARS) return false;
  return (
    line.mathRatio >= 0.3 ||
    Boolean(line.spans[0]?.math) ||
    SYMBOLIC.test(line.text.replace(/\s/g, ""))
  );
}

/**
 * Matriz, fração empilhada e radical inline saem do PDF em pedaços — as linhas da matriz em ordem
 * de coluna, o parêntese grande antes do conteúdo. O que a montagem deixou como fragmento volta
 * para a linha ao lado, se estiver na mesma faixa e colado nela.
 *
 * Só fragmento se junta: prosa nunca. É o que impede duas colunas de texto na mesma altura de
 * virarem uma linha — o vão da calha é pequeno, mas nenhuma das duas é fragmento.
 */
function mergeFragments(lines: readonly TextLine[]): TextLine[] {
  const result = [...lines];

  for (let pass = 0; pass < 4; pass++) {
    let changed = false;

    for (let i = 0; i < result.length; i++) {
      const fragment = result[i];
      if (!fragment || !isFragment(fragment)) continue;

      let target = -1;
      for (let j = 0; j < result.length; j++) {
        const other = result[j];
        if (j === i || !other) continue;
        // Começar na mesma margem é ser a linha seguinte, não um pedaço desta: a alternativa "E √2"
        // tem radical alto o bastante para invadir a faixa da "D".
        if (fragment.x0 <= other.x0 + 1) continue;
        const overlap = Math.min(other.y1, fragment.y1) - Math.max(other.y0, fragment.y0);
        const smaller = Math.min(other.y1 - other.y0, fragment.y1 - fragment.y0);
        if (overlap < smaller * 0.3) continue;
        const gap = Math.max(other.x0, fragment.x0) - Math.min(other.x1, fragment.x1);
        if (gap > fragment.size * 0.8) continue;
        const current = result[target];
        if (!current || other.text.length > current.text.length) target = j;
      }

      const host = result[target];
      if (!host) continue;
      result[target] = {
        ...host,
        spans: [...host.spans, ...fragment.spans],
        x0: Math.min(host.x0, fragment.x0),
        y0: Math.min(host.y0, fragment.y0),
        x1: Math.max(host.x1, fragment.x1),
        y1: Math.max(host.y1, fragment.y1),
      };
      result.splice(i, 1);
      i--;
      changed = true;
    }

    if (!changed) break;
  }

  return result;
}

/**
 * Depois de um fim de linha, só continua o que está claramente **à direita** e na mesma faixa —
 * pelo menos metade da altura do trecho dentro da linha. A linha seguinte de um parágrafo começa
 * na margem, à esquerda do fim desta, e quebra.
 */
function continuesToTheRight(line: Rect, span: TextSpan): boolean {
  const overlap = Math.min(line.y1, span.y1) - Math.max(line.y0, span.y0);
  const spanHeight = span.y1 - span.y0;
  if (overlap < spanHeight * 0.5) return false;
  const gap = span.x0 - line.x1;
  if (gap >= -span.size * 0.5 && gap <= span.size * MAX_GAP_IN_LINE) return true;
  // A segunda linha de uma matriz volta para a esquerda, mas fica dentro da faixa da fórmula. Só
  // matemática e símbolo podem voltar: a linha seguinte de um parágrafo começa com palavra.
  const symbolic = span.math || SYMBOLIC.test(span.text.trim());
  return symbolic && span.x0 >= line.x0 && span.x1 <= line.x1 + 1;
}

/**
 * Parte a linha antes de cada trecho em que `starts` reconhece o começo de outra coisa (D77).
 *
 * A página de respostas imprime várias numa linha só — "90. a  91. a  92. b" —, e a camada de
 * texto as entrega como uma linha. Só parte onde há espaço antes do trecho: "2.5" colado não é
 * começo de nada. O primeiro pedaço fica com o id da linha; os outros, com o id e um sufixo.
 */
export function splitLine(
  line: TextLine,
  starts: (rest: TextLine) => boolean,
): readonly TextLine[] {
  const spans = [...line.spans].sort((a, b) => a.x0 - b.x0);
  const lineOf = (group: readonly TextSpan[]) =>
    makeLine(line.pageNumber, 0, group, boundsOf(group));
  const groups: TextSpan[][] = [[]];
  spans.forEach((span, index) => {
    const previous = spans[index - 1];
    const gap = previous ? span.x0 - previous.x1 : 0;
    if (previous && gap >= span.size * 0.8 && starts(lineOf(spans.slice(index)))) groups.push([]);
    groups.at(-1)!.push(span);
  });
  if (groups.length === 1) return [line];
  return groups.map((group, index) => ({
    ...lineOf(group),
    id: index === 0 ? line.id : `${line.id}~${index}`,
  }));
}

function boundsOf(spans: readonly TextSpan[]): Rect {
  return {
    x0: Math.min(...spans.map((span) => span.x0)),
    y0: Math.min(...spans.map((span) => span.y0)),
    x1: Math.max(...spans.map((span) => span.x1)),
    y1: Math.max(...spans.map((span) => span.y1)),
  };
}

function makeLine(
  pageNumber: number,
  index: number,
  spans: readonly TextSpan[],
  box: Rect,
): TextLine {
  // O acento solto fica em cima da letra, com o x um pouco à direita do começo dela: ordenado pelo
  // x puro, ele cairia depois da letra que acentua.
  const key = (span: TextSpan) =>
    isSpacingAccent(span.text.trim()) ? span.x0 - span.size * 0.6 : span.x0;
  const sorted = [...spans].sort((a, b) => key(a) - key(b));

  let text = "";
  let previous: TextSpan | null = null;
  for (const span of sorted) {
    const piece = span.text.trim();
    if (previous && piece !== "") {
      const gap = span.x0 - previous.x1;
      if (gap > span.size * 0.12 && !text.endsWith(" ")) text += " ";
    }
    text += span.text.replace(/\s+/g, " ");
    previous = span;
  }

  // Operador, dígito e parêntese em fonte romana contam como matemática quando encostam num
  // trecho de matemática: o TeX compõe `+`, `=` e o expoente `2` em fonte de texto, e sem isto
  // `x^2 + y^2 = r^2` pesaria três caracteres de fórmula numa linha de quarenta.
  const mathy = sorted.map((span, i) => {
    if (span.math) return true;
    if (!SYMBOLIC.test(span.text.trim())) return false;
    return Boolean(sorted[i - 1]?.math || sorted[i + 1]?.math);
  });
  const inMath = new Set(sorted.filter((_, i) => mathy[i]));

  const weight = (span: TextSpan) => span.text.replace(/\s/g, "").length;
  const total = spans.reduce((sum, span) => sum + weight(span), 0) || 1;
  const share = (predicate: (span: TextSpan) => boolean) =>
    spans.filter(predicate).reduce((sum, span) => sum + weight(span), 0) / total;

  // O corpo da linha é o do texto que não é matemática: o expoente em 8 pt não pode puxar para
  // baixo o corpo de uma linha de 10 pt, nem um ∑ grande empurrar para cima.
  const prose = spans.filter((span) => !span.math);
  const sizes = (prose.length > 0 ? prose : spans).flatMap((span) =>
    Array.from({ length: Math.max(1, weight(span)) }, () => span.size),
  );

  const byFont = new Map<string, number>();
  for (const span of spans)
    byFont.set(span.fontName, (byFont.get(span.fontName) ?? 0) + weight(span));
  const fontName = [...byFont.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

  return {
    id: `p${pageNumber}-l${index}`,
    pageNumber,
    text: composeSpacingAccents(text.trim()),
    spans: sorted,
    x0: box.x0,
    y0: box.y0,
    x1: box.x1,
    y1: box.y1,
    size: median(sizes),
    fontName,
    bold: share((span) => span.bold) >= 0.6,
    italic: share((span) => span.italic && !span.math) >= 0.6,
    mathRatio: share((span) => inMath.has(span)),
  };
}

/**
 * A página do motor como camada de texto, no formato da segmentação da captura (ARQ-06).
 *
 * Cada trecho vira uma palavra pela mesma conta do leitor do navegador (`wordFromBaseline`),
 * a partir da linha de base guardada — e não da caixa, que no glifo pendurado da fonte de extensão
 * desce 2,6 corpos abaixo da base.
 */
export function toTextPage(page: PageModel): TextPage {
  return {
    width: page.width,
    height: page.height,
    words: page.lines.flatMap((line) =>
      line.spans.map((span) =>
        wordFromBaseline({
          text: span.text,
          x: span.x0,
          width: span.x1 - span.x0,
          baseline: span.baseline,
          fontSize: span.size,
        }),
      ),
    ),
  };
}

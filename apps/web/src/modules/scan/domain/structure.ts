import { escapeLatexText } from "@modules/recognition/domain/latex-escape";

import type { AnchorMatch, CaptureProfile, DraftItem, Extent, OpenElement, WalkContext } from "./capture-profile";
import { assembleDocument, positionOf, type DocLine, type ScanDocument } from "./document";
import { toNormalizedBox } from "./geometry";
import type { PageModel } from "./page";
import {
  combineConfidence,
  HEADING_KINDS,
  measure,
  type ProposedItem,
  type ProposedRegion,
  type Proposal,
  type ScanKind,
} from "./proposal";
import { indexBySlot, segmentsBetween, segmentsOfLines, type Segment } from "./regions";
import { foldText } from "./text";
import { normalizeNumber } from "./toc";

/**
 * O motor genérico: do livro em ordem de leitura à proposta (Fases 3 e 4 do prompt 03).
 *
 * Um caminho só pelas linhas. Cada linha é perguntada ao perfil — "isto abre alguma coisa?" — e o
 * que ela abre entra numa pilha de elementos abertos, sob o mais interno que pode contê-la. Um
 * elemento termina quando chega uma âncora que ele não pode conter, ou um limite semântico, ou o
 * fim do parágrafo quando o perfil pediu parágrafo. É a regra da §12 — "ocupa tudo entre a âncora
 * e o próximo limite" — e é por ela que coluna e página não são caso especial.
 *
 * Determinístico do começo ao fim (§14): a IA, quando entra, entra depois, e só na proposta.
 */

interface OpenRecord {
  readonly key: string;
  readonly parentKey: string | null;
  readonly kind: ScanKind;
  readonly match: AnchorMatch | null;
  readonly anchorLines: readonly DocLine[];
  readonly startIndex: number;
  stopIndex: number | null;
  readonly extent: Extent;
  readonly element: OpenElement;
  readonly lastChild: Map<ScanKind, OpenElement>;
}

export function buildProposal(pages: readonly PageModel[], profile: CaptureProfile): Proposal {
  const scannedPages = pages.filter((page) => page.scanned).length;
  const scanWarnings = pages
    .filter((page) => page.scanned)
    .map((page) => `Página ${page.pageNumber} sem camada de texto: precisa de reconhecimento de texto.`);

  if (profile.buildItems) {
    const drafts = profile.buildItems(pages);
    const items = drafts.map((draft) => finalize(draft, profile, null));
    return {
      items,
      warnings: scanWarnings,
      metrics: measure(items, pages.length, scannedPages),
      pageOffset: null,
    };
  }

  const doc = assembleDocument(pages, {
    ...(profile.isProtected ? { protect: profile.isProtected.bind(profile) } : {}),
    ...(profile.columnHints ? { columnHints: profile.columnHints.bind(profile) } : {}),
  });

  const records = walk(doc, profile);
  const linesBySlot = indexBySlot(doc.lines);
  const drafts = records.map((record) => draftOf(record, doc, linesBySlot));
  const { drafts: checked, warnings: tocWarnings, offset } = checkAgainstToc(drafts, doc);
  const items = checked.map((draft) => finalize(draft, profile, doc, offset));

  return {
    items,
    warnings: [...scanWarnings, ...tocWarnings],
    metrics: measure(items, pages.length, scannedPages),
    pageOffset: offset,
  };
}

function walk(doc: ScanDocument, profile: CaptureProfile): OpenRecord[] {
  const { lines, style } = doc;
  const learned = profile.learnStyle?.(lines, style) ?? new Map<string, ScanKind>();
  const records: OpenRecord[] = [];
  const stack: OpenRecord[] = [];
  const rootChildren = new Map<ScanKind, OpenElement>();
  let content: { start: number } | null = null;
  let skipUntil = 0;
  const keys = new Set<string>();

  const uniqueKey = (base: string) => {
    let key = base;
    for (let n = 2; keys.has(key); n++) key = `${base}#${n}`;
    keys.add(key);
    return key;
  };

  const close = (record: OpenRecord, stopIndex: number) => {
    if (record.stopIndex === null) record.stopIndex = stopIndex;
  };

  const flushContent = (stopIndex: number) => {
    if (!content) return;
    const start = content.start;
    content = null;
    const parent = stack[stack.length - 1];
    if (stopIndex <= start || !parent || !profile.canContain(parent.kind, "CONTENT")) return;
    const first = lines[start];
    if (!first) return;
    const record: OpenRecord = {
      key: uniqueKey(`CONTENT:${first.pageNumber}:${first.id}`),
      parentKey: parent.key,
      kind: "CONTENT",
      match: null,
      anchorLines: [],
      startIndex: start,
      stopIndex,
      extent: "until-boundary",
      element: { kind: "CONTENT", number: null, anchor: first, metadata: {} },
      lastChild: new Map(),
    };
    records.push(record);
  };

  const popUntil = (accepts: (record: OpenRecord | null) => boolean, stopIndex: number) => {
    while (stack.length > 0) {
      const top = stack[stack.length - 1] ?? null;
      if (accepts(top)) return;
      if (top) close(top, stopIndex);
      stack.pop();
    }
  };

  for (let i = 0; i < lines.length; i++) {
    if (i < skipUntil) continue;
    const line = lines[i];
    if (!line) continue;

    const context: WalkContext = {
      doc,
      style,
      line,
      peek: (offset) => lines[i + offset],
      open: stack.map((record) => record.element),
      lastSibling: (kind) => {
        for (let s = stack.length - 1; s >= 0; s--) {
          const record = stack[s];
          if (record && profile.canContain(record.kind, kind)) return record.lastChild.get(kind) ?? null;
        }
        return profile.canContain(null, kind) ? (rootChildren.get(kind) ?? null) : null;
      },
      columnLeft: doc.slots[line.slot]?.column.x0 ?? line.x0,
      learned,
    };

    if (profile.isBoundary?.(context)) {
      flushContent(i);
      popUntil((top) => top === null || HEADING_KINDS.has(top.kind), i);
      skipUntil = i + 1;
      continue;
    }

    const match = profile.classifyLine(context);
    const placeable =
      match !== null &&
      (profile.canContain(null, match.kind) ||
        stack.some((record) => profile.canContain(record.kind, match.kind)));

    if (match && placeable) {
      flushContent(i);
      if (match.closes && match.closes.length > 0) {
        const closes = new Set(match.closes);
        const deepest = stack.findIndex((record) => closes.has(record.kind));
        if (deepest >= 0) popUntil((top) => stack.indexOf(top as OpenRecord) < deepest, i);
      }
      popUntil((top) => profile.canContain(top?.kind ?? null, match.kind), i);

      const parent = stack[stack.length - 1] ?? null;
      const consumed = Math.max(1, match.lines);
      const anchorLines = lines.slice(i, i + consumed);
      const element: OpenElement = {
        kind: match.kind,
        number: match.number,
        anchor: line,
        metadata: { ...(parent?.element.metadata ?? {}), ...(match.metadata ?? {}) },
      };
      const record: OpenRecord = {
        key: uniqueKey(`${match.kind}:${line.pageNumber}:${line.id}`),
        parentKey: parent?.key ?? null,
        kind: match.kind,
        match,
        anchorLines,
        startIndex: i,
        stopIndex: null,
        extent: match.extent,
        element,
        lastChild: new Map(),
      };
      (parent ? parent.lastChild : rootChildren).set(match.kind, element);
      records.push(record);
      stack.push(record);
      if (match.extent === "heading") close(record, i + consumed);
      skipUntil = i + consumed;
      continue;
    }

    // Linha comum: pertence ao elemento aberto, ou vira texto corrido do título aberto.
    let top = stack[stack.length - 1];
    if (top?.extent === "paragraph" && isParagraphBreak(lines[i - 1], line, doc)) {
      close(top, i);
      stack.pop();
      top = stack[stack.length - 1];
    }
    if (top?.extent === "block" && isBlockBreak(lines[i - 1], line, doc)) {
      close(top, i);
      stack.pop();
      top = stack[stack.length - 1];
    }

    if (top && top.extent !== "heading") continue;
    if (profile.settings.emitContent && top) content ??= { start: i };
  }

  flushContent(lines.length);
  for (const record of stack) close(record, lines.length);

  // Pais antes dos filhos, na ordem em que foram abertos — o texto corrido entra onde começa.
  const byKey = new Map(records.map((record) => [record.key, record]));
  const depth = new Map<string, number>();
  const depthOf = (record: OpenRecord): number => {
    const known = depth.get(record.key);
    if (known !== undefined) return known;
    const parent = record.parentKey ? byKey.get(record.parentKey) : undefined;
    const value = parent ? depthOf(parent) + 1 : 0;
    depth.set(record.key, value);
    return value;
  };
  return records.sort((a, b) => a.startIndex - b.startIndex || depthOf(a) - depthOf(b));
}

/**
 * Fim de parágrafo: um vão vertical maior que a entrelinha, ou a linha seguinte recuada como
 * começo de parágrafo. Na coluna ou página seguinte não é fim — é continuação, a menos que recue.
 */
function isParagraphBreak(previous: DocLine | undefined, line: DocLine, doc: ScanDocument): boolean {
  if (!previous) return false;
  const { style } = doc;
  const left = doc.slots[line.slot]?.column.x0 ?? line.x0;
  const indented = line.x0 > left + style.bodySize * 0.8;

  if (previous.slot !== line.slot) return indented;
  const gap = line.y0 - previous.y0;
  // O recuo só conta numa linha que está de fato abaixo da anterior: o denominador de uma fração
  // também começa "recuado", e na mesma altura.
  const below = line.y0 >= previous.y1 - 1 && gap >= style.lineSpacing * 0.8;
  return gap > style.lineSpacing * 1.35 || (below && indented && previous.x0 <= left + style.bodySize * 0.5);
}

/**
 * O fim de um bloco: o vão grande, não o recuo.
 *
 * Parágrafo comum de livro se separa por **recuo**, sem espaço extra; um bloco — exemplo,
 * observação — se separa por **espaço**. Só o espaço fecha aqui, e é por isso que a resolução do
 * exemplo, que é parágrafo novo, continua dentro dele.
 *
 * A régua é a entrelinha do corpo, e não a `lineSpacing` sozinha: num trecho esparso — uma
 * página com meia dúzia de linhas — a moda dos vãos é o vão *entre parágrafos*, e usá-la deixaria
 * o bloco engolir o livro inteiro. O tamanho da fonte dá o piso que a moda não dá.
 *
 * Trocar de coluna ou de página não fecha: o exemplo que vira a página continua sendo um.
 */
function isBlockBreak(previous: DocLine | undefined, line: DocLine, doc: ScanDocument): boolean {
  if (!previous || previous.slot !== line.slot) return false;
  // O branco **entre as caixas**, e não a distância entre as bases.
  //
  // Medido no *Curso de Análise*: uma fração no meio da frase afasta as bases em 26 pt, quase o
  // dobro da entrelinha — pela distância entre bases, todo exemplo terminaria na primeira fração.
  // Só que a caixa da linha cresceu junto: o branco continua o mesmo. É ele que o olho lê como
  // "aqui acabou", e é ele que o espaço extra do ambiente de exemplo aumenta.
  // Fórmula em destaque abre branco de verdade — e não é fim de nada: é a conta do exemplo, e o
  // que vem depois dela ainda é o exemplo. Medido no *Curso de Análise*: sem esta guarda, três
  // exemplos terminavam em "Seja X = {1, 2, 3}. Então", logo antes da fórmula que os explica.
  if (previous.mathRatio >= 0.5 || line.mathRatio >= 0.5) return false;

  const { style } = doc;
  const white = line.y0 - previous.y1;
  return white > style.bodySize * 0.55;
}

function draftOf(
  record: OpenRecord,
  doc: ScanDocument,
  linesBySlot: ReadonlyMap<number, readonly DocLine[]>,
): DraftItem {
  const stopIndex = record.stopIndex ?? doc.lines.length;
  const lines = doc.lines.slice(record.startIndex, stopIndex);
  const first = doc.lines[record.startIndex] ?? record.element.anchor;

  let segments: Segment[];
  if (record.extent === "heading") {
    segments = segmentsOfLines(doc, record.anchorLines);
  } else {
    const stopLine = doc.lines[stopIndex];
    segments = segmentsBetween(doc, positionOf(first), stopLine ? positionOf(stopLine) : null, linesBySlot);
    // Um elemento de uma linha colado no seguinte não abre faixa nenhuma: a caixa é a da linha.
    if (segments.length === 0) segments = segmentsOfLines(doc, lines.length > 0 ? lines : [first]);
  }

  const pageSize = new Map(doc.pages.map((page) => [page.pageNumber, page]));
  const regions: ProposedRegion[] = segments.flatMap((segment, index) => {
    const page = pageSize.get(segment.pageNumber);
    if (!page) return [];
    const hasText = lines.some(
      (line) => line.pageNumber === segment.pageNumber && line.y0 >= segment.rect.y0 - 1 && line.y1 <= segment.rect.y1 + 1,
    );
    return [
      {
        pageNumber: segment.pageNumber,
        box: toNormalizedBox(segment.rect, page),
        role: index === 0 ? "PRIMARY" : hasText ? "CONTINUATION" : "ILLUSTRATION",
      },
    ];
  });

  const bodyLines = record.extent === "heading" ? record.anchorLines : lines;
  const text = bodyLines.map((line) => line.text).join("\n");
  const chars = bodyLines.reduce((sum, line) => sum + line.text.length, 0) || 1;
  const mathChars = bodyLines.reduce((sum, line) => sum + line.text.length * line.mathRatio, 0);
  const needsMath = mathChars / chars >= 0.05 || bodyLines.some((line) => line.mathRatio >= 0.5);
  const match = record.match;

  return {
    key: record.key,
    parentKey: record.parentKey,
    kind: record.kind,
    originalLabel: match?.label ?? null,
    number: match?.number ?? null,
    title: match?.title ?? null,
    pageNumber: first.pageNumber,
    printedPage: null,
    regions,
    text,
    latex: needsMath ? null : escapeLatexText(text),
    needsMath,
    confidence: 0,
    confidenceParts: match?.confidence ?? { pattern: 0.85, layout: regions.length > 0 ? 0.9 : 0.3 },
    evidence: match?.evidence ?? ["texto corrido entre dois elementos"],
    metadata: record.element.metadata,
    lines: bodyLines,
  };
}

const TOC_KINDS: ReadonlySet<ScanKind> = new Set(["PART", "CHAPTER", "SECTION", "SUBSECTION"]);

/**
 * O sumário confere a estrutura (§19): o que ele cita e o scan achou ganha evidência; o que ele
 * cita dentro das páginas varridas e o scan não achou vira aviso. A diferença entre a página do
 * PDF e a impressa sai daqui quando a mobília não a mostrou.
 */
function checkAgainstToc(
  drafts: readonly DraftItem[],
  doc: ScanDocument,
): { drafts: DraftItem[]; warnings: string[]; offset: number | null } {
  const entries = doc.toc.entries;
  if (entries.length === 0) return { drafts: [...drafts], warnings: [], offset: doc.pageOffset };

  const offsets = new Map<number, number>();
  const matched = new Set<number>();
  // O tipo que o sumário sugere é ambíguo — "1 Conjuntos" é capítulo num livro e seção no outro —,
  // então quem casa é o número com o começo do título; o tipo só desempata quando não há título.
  const titleKey = (text: string | null) => foldText(text ?? "").replace(/[^A-Z0-9]/g, "").slice(0, 12);
  const result = drafts.map((draft) => {
    if (!TOC_KINDS.has(draft.kind) || draft.number === null) return draft;
    const number = normalizeNumber(draft.number);
    const key = titleKey(draft.title);
    const index = entries.findIndex(
      (entry, i) =>
        !matched.has(i) &&
        entry.number === number &&
        (key !== "" ? titleKey(entry.title) === key : entry.kind === draft.kind),
    );
    const entry = entries[index];
    if (!entry) return draft;
    matched.add(index);
    const offset = draft.pageNumber - entry.printedPage;
    offsets.set(offset, (offsets.get(offset) ?? 0) + 1);
    return {
      ...draft,
      confidenceParts: { ...draft.confidenceParts, continuity: 0.98 },
      evidence: [...draft.evidence, `o sumário cita na página impressa ${entry.printedPage}`],
    };
  });

  const tocOffset = [...offsets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const offset = doc.pageOffset ?? tocOffset;
  const scanned = new Set(doc.pages.map((page) => page.pageNumber));
  const warnings: string[] = [];

  if (offset !== null) {
    entries.forEach((entry, index) => {
      if (matched.has(index)) return;
      const expected = entry.printedPage + offset;
      if (scanned.has(expected) && !doc.toc.pages.has(expected)) {
        warnings.push(
          `O sumário cita ${entry.number ?? ""} ${entry.title} na página impressa ${entry.printedPage} (PDF ${expected}), e o scan não achou.`.replace(/\s+/g, " "),
        );
      }
    });
  }

  return { drafts: result, warnings, offset };
}

function finalize(
  draft: DraftItem,
  profile: CaptureProfile,
  doc: ScanDocument | null,
  offset: number | null = null,
): ProposedItem {
  const diagnostic = doc && profile.validateItem ? profile.validateItem(draft, doc) : null;
  const confidence = combineConfidence(draft.confidenceParts);
  const printed =
    doc?.furniture.printedPages.get(draft.pageNumber) ??
    (offset !== null ? String(draft.pageNumber - offset) : null);

  const acceptable =
    confidence >= profile.settings.autoAcceptThreshold &&
    draft.regions.length > 0 &&
    (diagnostic === null || diagnostic.status === "complete");

  // `lines` fica para trás: é andaime do motor, não parte da proposta.
  const { lines: _lines, ...rest } = draft;

  return {
    ...rest,
    printedPage: printed,
    confidence,
    diagnostic,
    reviewState: acceptable ? "AUTO_ACCEPTABLE" : "NEEDS_REVIEW",
  };
}

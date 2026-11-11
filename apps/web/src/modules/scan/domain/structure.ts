import { escapeLatexText, hasUnreadableSymbol } from "@modules/latex/domain/latex-escape";

import {
  zoneOfPage,
  type AnchorMatch,
  type CaptureProfile,
  type DocumentZone,
  type DraftItem,
  type Extent,
  type OpenElement,
  type WalkContext,
} from "./capture-profile";
import { assembleDocument, positionOf, type DocLine, type ScanDocument } from "./document";
import { findFigures, type Figure } from "./figures";
import { tableRows } from "./tables";
import { toNormalizedBox } from "@/shared/geometry/normalized-box";
import { splitLine, type PageModel, type TextLine, type TextSpan } from "./page";
import { measureStyle, type PublicationStyle } from "./typography";
import {
  combineConfidence,
  kindsWhere,
  measure,
  type ProposedItem,
  type ProposedRegion,
  type Proposal,
  type ScanKind,
} from "./proposal";
import { detectColumns } from "./layout";
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
  const zones = profile.zones?.(pages) ?? [];
  const walked = zones.length === 0 ? pages : pages.filter((page) => zoneOfPage(zones, page.pageNumber)?.skip !== true);
  const zoneWarnings = zones
    .filter((zone) => zone.skip === true && zone.answersTo === undefined)
    .map((zone) => `Zona "${zone.label}" (a partir da página ${zone.from}) não foi varrida.`);

  // Só as páginas que a varredura de fato olha: avisar que falta texto numa página pulada seria
  // pedir reconhecimento para um gabarito que ninguém vai ler.
  const scannedPages = walked.filter((page) => page.scanned).length;
  const scanWarnings = walked
    .filter((page) => page.scanned)
    .map((page) => `Página ${page.pageNumber} sem camada de texto: precisa de reconhecimento de texto.`);

  if (profile.buildItems) {
    const drafts = profile.buildItems(pages);
    const items = drafts.map((draft) => finalize(draft, profile, null));
    return {
      items,
      warnings: [...scanWarnings, ...zoneWarnings],
      metrics: measure(items, pages.length, scannedPages),
      pageOffset: null,
    };
  }

  const full = assembleDocument(walked, {
    ...(profile.isProtected ? { protect: profile.isProtected.bind(profile) } : {}),
    ...(profile.columnHints ? { columnHints: profile.columnHints.bind(profile) } : {}),
    ...(profile.singleColumn ? { singleColumn: true } : {}),
    // A zona que declara colunas tem as dela, mesmo num documento de uma coluna só.
    ...(zones.some((zone) => zone.columns)
      ? {
          pageDividers: (lines: readonly TextLine[]) => {
            const page = lines[0]?.pageNumber;
            if (page === undefined || !zoneOfPage(zones, page)?.columns) return null;
            return detectColumns(lines).slice(1).map((column) => column.x0);
          },
        }
      : {}),
  });
  const { doc, figures } = withoutFigures(full, profile);

  const records = walk(doc, profile, zones);
  const linesBySlot = indexBySlot(doc.lines);
  const drafts = withFigures(records.map((record) => draftOf(record, doc, linesBySlot)), figures, records, doc, profile, full.lines);
  const { drafts: checked, warnings: tocWarnings, offset } = checkAgainstToc(drafts, doc);
  const items = [
    ...checked.map((draft) => withZoneType(finalize(draft, profile, doc, offset), zones)),
    ...answerItems(pages, zones, profile),
  ];

  return {
    items,
    warnings: [...scanWarnings, ...tocWarnings, ...zoneWarnings],
    metrics: measure(items, pages.length, scannedPages),
    pageOffset: offset,
  };
}

/**
 * As figuras saem do fluxo antes da caminhada, e as linhas que elas engolem saem junto.
 */
function withoutFigures(full: ScanDocument, profile: CaptureProfile): { doc: ScanDocument; figures: readonly Figure[] } {
  /*
    As figuras saem do fluxo antes da caminhada (D58, ADR 0005).

    As letras de dentro de um diagrama são texto de verdade no PDF. Se elas continuassem na lista
    de linhas, o corpo do capítulo receberia "A B U P" entre dois parágrafos, e a legenda viraria
    um parágrafo órfão logo abaixo da figura. Tirá-las aqui é o que faz o resto do motor —
    parágrafos, extents, regiões — continuar valendo sem saber que figura existe.
  */
  /*
    O que o perfil protege, a figura não engole.

    É o mesmo `isProtected` da mobília, e pela mesma razão: a linha que o perfil marca é estrutura
    do documento, e estrutura não é rótulo de desenho. Calculado uma vez, por id, porque a
    absorção consulta cada linha várias vezes enquanto a caixa cresce.
  */
  const protectedIds = profile.isProtected
    ? new Set(full.lines.filter((line) => profile.isProtected!(line, full.style)).map((line) => line.id))
    : null;
  const lineById = new Map(full.lines.map((line) => [line.id, line]));

  const figures = profile.kinds.includes("FIGURE")
    ? findFigures({
        graphics: full.graphics,
        lines: full.lines,
        bodySize: full.style.bodySize,
        lineSpacing: full.style.lineSpacing,
        ...(protectedIds === null ? {} : { protect: (line: { readonly id: string }) => protectedIds.has(line.id) }),
        isTable: (ids) => tableRows(ids.flatMap((id) => lineById.get(id) ?? [])) !== null,
      })
    : [];
  const hidden = new Set(figures.flatMap((figure) => [...figure.absorbedLineIds, ...figure.captionLineIds]));
  const doc: ScanDocument = hidden.size === 0 ? full : { ...full, lines: full.lines.filter((line) => !hidden.has(line.id)) };
  return { doc, figures };
}

/**
 * As respostas das zonas de respostas (D77).
 *
 * A zona não tem estrutura — "Capítulo I" ali é só o agrupamento das respostas —, então ela não
 * passa pela caminhada dos títulos: cada "135." abre uma Resposta, que vai até a próxima ou até o
 * que o perfil diz que a fecha. O resto é o mesmo de qualquer item: regiões que atravessam coluna
 * e página, texto, matemática, figuras.
 *
 * A página de respostas tem as colunas que o corpo do livro pode não ter: o `singleColumn` do
 * perfil não vale aqui.
 */
function answerItems(pages: readonly PageModel[], zones: readonly DocumentZone[], profile: CaptureProfile): ProposedItem[] {
  if (!profile.answerStart) return [];
  const items: ProposedItem[] = [];
  for (const zone of zones) {
    if (zone.skip !== true || zone.answersTo === undefined) continue;
    const within = pages.filter((page) => zoneOfPage(zones, page.pageNumber) === zone);
    if (within.length === 0) continue;
    // Várias respostas na mesma linha — "90. a  91. a  92. b" — viram uma linha cada.
    const style = measureStyle(within.flatMap((page) => page.lines));
    const zonePages = within.map((page) => ({
      ...page,
      lines: page.lines.flatMap((line) => splitLine(line, (rest) => profile.answerStart?.(rest, style) != null)),
    }));

    const full = assembleDocument(zonePages, {
      ...(profile.isProtected ? { protect: profile.isProtected.bind(profile) } : {}),
      pageDividers: (lines, style) => answerDividers(lines, style, profile),
    });
    const { doc, figures } = withoutFigures(full, profile);
    const records = walkAnswers(doc, profile, zone.answersTo);
    const linesBySlot = indexBySlot(doc.lines);
    const drafts = withFigures(records.map((record) => draftOf(record, doc, linesBySlot)), figures, records, doc, profile, full.lines);
    items.push(...drafts.map((draft) => finalize(draft, profile, doc)));
  }
  return items;
}

/**
 * Onde as colunas de uma página de respostas começam, pelas próprias respostas (D77).
 *
 * A detecção genérica pede linhas dos dois lados, e a coluna de respostas em gráfico tem quatro ou
 * cinco linhas de texto: a página 291 do *Fundamentos* vol. 1 saía numa coluna só, o "354." da
 * direita entrava antes do "331." da esquerda, e 23 respostas sumiam como número que não avança.
 *
 * Os números e os títulos de capítulo começam na margem de cada coluna — e também no meio dela,
 * na última célula de uma grade de respostas curtas ("103. c" ao lado de "100. e 101. a 102. d").
 * A calha é o começo que nenhuma linha atravessa: a linha longa da coluna da esquerda atravessa o
 * meio da grade, e não a calha.
 */
function answerDividers(
  lines: readonly TextLine[],
  style: PublicationStyle,
  profile: CaptureProfile,
): readonly number[] | null {
  const starts = lines
    .filter((line) => profile.answerStart?.(line, style) || profile.answerBoundary?.(line, style))
    .map((line) => line.x0);
  if (starts.length < 2) return null;
  const margin = Math.min(...starts);
  const candidates = [...new Set(starts.filter((x) => x - margin > style.bodySize * 4).map(Math.round))];

  let best: { readonly divider: number; readonly crossing: number } | null = null;
  for (const x of candidates) {
    const divider = x - 3;
    const crossing = lines.filter((line) => line.x0 < divider - 8 && line.x1 > divider + 8).length;
    if (!best || crossing < best.crossing || (crossing === best.crossing && divider < best.divider)) best = { divider, crossing };
  }
  return best && best.crossing <= Math.max(1, lines.length * 0.05) ? [best.divider] : null;
}

function walkAnswers(doc: ScanDocument, profile: CaptureProfile, answersTo: "EXERCISE" | "QUESTION"): OpenRecord[] {
  const records: OpenRecord[] = [];
  let open: OpenRecord | null = null;
  let last = 0;
  const close = (stopIndex: number) => {
    if (open) open.stopIndex = stopIndex;
    open = null;
  };

  doc.lines.forEach((line, index) => {
    if (profile.answerBoundary?.(line, doc.style)) return close(index);
    const start = profile.answerStart?.(line, doc.style) ?? null;
    const number = start ? Number.parseInt(start.number, 10) : Number.NaN;
    // Número que não avança é texto da resposta aberta: "2." dentro da resposta do 135.
    if (start === null || !(number > last)) return;

    close(index);
    const continuity = last === 0 ? 0.8 : number === last + 1 ? 0.97 : 0.85;
    const metadata = { answersTo };
    const record: OpenRecord = {
      key: `ANSWER:${line.pageNumber}:${line.id}`,
      parentKey: null,
      kind: "ANSWER",
      match: {
        kind: "ANSWER",
        label: start.label,
        number: start.number,
        title: null,
        extent: "until-boundary",
        lines: 1,
        confidence: { pattern: 0.9, continuity },
        evidence: [
          `resposta do ${answersTo === "EXERCISE" ? "exercício" : "questão"} ${start.number}`,
          last === 0 ? "primeira da zona" : `segue a ${last}`,
        ],
        metadata,
      },
      anchorLines: [line],
      startIndex: index,
      stopIndex: null,
      extent: "until-boundary",
      element: { kind: "ANSWER", number: start.number, anchor: line, metadata },
      lastChild: new Map(),
    };
    records.push(record);
    open = record;
    last = number;
  });
  close(doc.lines.length);
  return records;
}

/**
 * Intercala as figuras entre os itens, na ordem de leitura, sob quem as contém.
 *
 * A figura não tem âncora de texto — ninguém escreve "Figura" para abri-la —, então ela não passa
 * pela caminhada. O pai dela é o elemento que estava aberto no ponto da página em que ela
 * aparece: a seção, o exemplo, o exercício. Se nenhum aceita figura, ela fica sem pai, e a
 * aprovação decide o que fazer com isso.
 */
/**
 * Carimba no item o tipo de questão que a zona pede (ADR 0009).
 *
 * Vai em `metadata` de propósito: é informação do perfil sobre aquele item, e `metadata` é onde o
 * perfil já fala com a aprovação — `figureKind`, `widthFraction`. Uma coluna nova no banco para
 * guardar um enum que só a aprovação lê seria migração sem dono.
 *
 * E carimba **só** isso. O rótulo da zona também caberia aqui e não entra: pelo critério do
 * ADR 0007, campo sem consumidor não fica. Se um dia a revisão quiser mostrar de que parte do
 * livro veio o item, ele volta junto com a tela que o mostra.
 */
function withZoneType(item: ProposedItem, zones: readonly DocumentZone[]): ProposedItem {
  const questionType = zones.length === 0 ? undefined : zoneOfPage(zones, item.pageNumber)?.questionType;
  return questionType === undefined ? item : { ...item, metadata: { ...item.metadata, questionType } };
}

/**
 * O elemento que começa logo depois da figura, quando a figura é dele.
 *
 * - **Ao lado**: a primeira linha depois da figura abre um elemento e cai dentro da altura dela,
 *   na mesma coluna. É o gráfico à direita do "80." — o topo do desenho fica acima do número —, a
 *   vinheta com o "CAPÍTULO VI" por cima, o retrato ao lado do "LEITURA" (*Fundamentos* vol. 1,
 *   p. 105 e 46).
 * - **Abertura de capítulo**: o capítulo começa na mesma página, abaixo da figura — a arte que
 *   abre as "Questões de vestibulares" (p. 321).
 *
 * Fora disso, quem começa abaixo da figura não é dono dela: o diagrama da resposta 21 ia para a
 * 22, logo embaixo (p. 279), e os gráficos do exercício 144 para a seção seguinte (p. 92).
 */
function ownerAfter(figure: Figure, at: number, records: readonly OpenRecord[], doc: ScanDocument): OpenRecord | undefined {
  const first = doc.lines[at];
  const next = records.find((record) => record.startIndex === at);
  if (!first || !next || first.pageNumber !== figure.pageNumber) return undefined;
  const beside = first.slot === figure.slot && first.y0 < figure.box.y1;
  const opensChapter = next.kind === "CHAPTER" || next.kind === "PART";
  return beside || opensChapter ? next : undefined;
}

function withFigures(
  drafts: readonly DraftItem[],
  figures: readonly Figure[],
  records: readonly OpenRecord[],
  doc: ScanDocument,
  profile: CaptureProfile,
  allLines: readonly DocLine[],
): DraftItem[] {
  if (figures.length === 0) return [...drafts];
  const lineById = new Map(allLines.map((line) => [line.id, line]));

  const pageSize = new Map(doc.pages.map((page) => [page.pageNumber, page]));
  const positions = new Map(drafts.map((draft, index) => [draft.key, records[index]?.startIndex ?? index]));
  const byKey = new Map(records.map((record) => [record.key, record]));
  const entries = drafts.map((draft) => ({ at: positions.get(draft.key) ?? 0, draft }));
  const keys = new Set(drafts.map((draft) => draft.key));

  figures.forEach((figure, index) => {
    const page = pageSize.get(figure.pageNumber);
    if (!page) return;

    // Onde a figura está, em linhas: a última linha que vem antes dela na ordem de leitura.
    let at = 0;
    for (let i = 0; i < doc.lines.length; i++) {
      const line = doc.lines[i]!;
      if (line.slot < figure.slot || (line.slot === figure.slot && line.y0 <= figure.box.y0)) at = i + 1;
      else break;
    }

    /*
      De quem a figura é.

      Não dá para procurar quem "cobre" a posição: um título fecha logo depois do próprio texto —
      `SECTION[2,3]` —, e o que ele contém vem da árvore, não do intervalo. Então pega-se o último
      elemento que começou antes da figura — ou o que começa ao lado dela — e sobe-se por
      `parentKey` até alguém que aceite figura. É o mesmo caminho que a pessoa faz com o olho:
      "esta figura é daquela seção ali em cima".

      O que fecha no fim do próprio bloco — o exemplo do Livro A — já fechou quando a figura vem
      depois dele, e ela é de quem o contém. O exercício e a resposta vão até o próximo: a figura
      entre um e outro é do de cima.
    */
    const previous = [...records]
      .filter((record) => record.startIndex < at)
      .sort((a, b) => a.startIndex - b.startIndex)
      .at(-1);
    const closed = (record: OpenRecord) =>
      (record.extent === "block" || record.extent === "paragraph") && record.stopIndex !== null && record.stopIndex <= at;
    let parent: OpenRecord | undefined = ownerAfter(figure, at, records, doc) ?? previous;
    if (parent && parent === previous && closed(parent)) parent = parent.parentKey ? byKey.get(parent.parentKey) : undefined;
    while (parent && !profile.canContain(parent.kind, "FIGURE")) {
      parent = parent.parentKey ? byKey.get(parent.parentKey) : undefined;
    }

    let key = `FIGURE:p${figure.pageNumber}:${Math.round(figure.box.y0)}`;
    for (let n = 2; keys.has(key); n++) key = `FIGURE:p${figure.pageNumber}:${Math.round(figure.box.y0)}#${n}`;
    keys.add(key);

    const column = doc.slots[figure.slot]?.column;
    const columnWidth = column ? column.x1 - column.x0 : page.width;
    const fraction = Math.min(1, Math.max(0.15, (figure.box.x1 - figure.box.x0) / columnWidth));

    // A figura que é uma tabela: o que ela engoliu forma uma grade, e a grade vai como texto (D78).
    const absorbed = figure.absorbedLineIds.flatMap((id) => lineById.get(id) ?? []);
    const table = tableRows(absorbed);
    const tableText = table?.map((row) => row.join("\t")) ?? null;

    entries.push({
      // A fração precisa caber entre duas linhas: com um milésimo fixo, a 500ª figura de um livro
      // passaria da linha seguinte e sairia do lugar.
      at: at + ((index + 1) / (figures.length + 1)) * 0.9,
      draft: {
        key,
        parentKey: parent?.key ?? null,
        kind: "FIGURE",
        originalLabel: figure.label,
        number: null,
        title: figure.caption,
        pageNumber: figure.pageNumber,
        printedPage: null,
        regions: [
          {
            pageNumber: figure.pageNumber,
            box: toNormalizedBox(figure.crop, page),
            role: "ILLUSTRATION",
          },
        ],
        text: figure.caption ?? "",
        latex: null,
        // A tabela vai ao reconhecimento: é dele a forma e o cabeçalho que a camada de texto não lê.
        needsMath: tableText !== null,
        confidence: 0,
        confidenceParts: {
          layout: 0.9,
          // A legenda é a prova de que aquilo é uma figura para o livro, e não um traço solto.
          pattern: figure.caption === null ? 0.72 : 0.95,
        },
        evidence: [
          figure.kind === "raster" ? "imagem embutida na página" : "traços agrupados numa figura",
          ...(figure.caption === null ? [] : ["legenda logo abaixo"]),
          ...(figure.absorbedLineIds.length > 0 ? [`${figure.absorbedLineIds.length} rótulos dentro do desenho`] : []),
          ...(table ? [`tabela: ${table.length} linhas × ${table[0]!.length} colunas`] : []),
        ],
        metadata: {
          figureKind: figure.kind,
          widthFraction: Math.round(fraction * 100) / 100,
          absorbedLines: figure.absorbedLineIds.length,
          ...(tableText ? { tableRows: tableText } : {}),
        },
        lines: [],
      },
    });
  });

  return entries.sort((a, b) => a.at - b.at).map((entry) => entry.draft);
}

function walk(doc: ScanDocument, profile: CaptureProfile, zones: readonly DocumentZone[]): OpenRecord[] {
  const { lines, style } = doc;
  const learned = profile.learnStyle?.(lines, style) ?? new Map<string, ScanKind>();
  const records: OpenRecord[] = [];
  const stack: OpenRecord[] = [];
  const rootChildren = new Map<ScanKind, OpenElement>();
  // `leadLabel`: o texto começa na linha do título, depois do rótulo — o parágrafo emendado.
  let content: { start: number; leadLabel?: string } | null = null;
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
    const { start, leadLabel } = content;
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
      element: { kind: "CONTENT", number: null, anchor: first, metadata: leadLabel ? { leadLabel } : {} },
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
      zone: zones.length === 0 ? null : zoneOfPage(zones, line.pageNumber),
    };


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
      /*
        O parágrafo que emenda no número: "1. Chama-se proposição ou sentença…" (D76).

        O título sem nome é só o rótulo; o resto da linha é o começo do texto. Sem isto a linha
        ficava inteira com o título, que não tem onde guardá-la, e a primeira frase sumia.
      */
      const rest = match.label === null ? "" : leadText(line.text, match.label);
      if (match.label !== null && match.extent === "heading" && match.title === null && consumed === 1 && rest !== "" && profile.settings.emitContent) {
        content = { start: i, leadLabel: match.label };
      }
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
  const { style } = doc;
  const white = line.y0 - previous.y1;

  /*
    Fórmula em destaque abre branco dos dois lados, e os dois brancos querem dizer coisas
    diferentes.

    **Antes** dela o branco não fecha nada: é a conta do exemplo, e sem esta guarda três exemplos
    do *Curso de Análise* terminavam em "Seja X = {1, 2, 3}. Então", logo antes da fórmula que os
    explica.

    **Depois** dela o branco pode, sim, ser o fim: o exemplo acaba na fórmula e a teoria recomeça.
    Aí a régua é outra, mais larga — o espaço que a fórmula deixa embaixo é maior que o de um
    parágrafo, e só um vão claramente maior que esse conta como fim.
  */
  if (line.mathRatio >= 0.5) return false;
  if (previous.mathRatio >= 0.5) return white > style.bodySize * 1.6;

  return white > style.bodySize * 0.55;
}

/**
 * A fração no corpo do texto, com a barra desenhada (vol. 4, questão 73).
 *
 * "L/2" no meio da frase: o "L" e o "2" na fonte do texto, no mesmo corpo, um acima e outro abaixo
 * de um traço — que não é texto, é desenho. A camada lê "L 2", nenhuma regra de fonte vê conta, e
 * o item não ia ao modelo. O traço curto e fino com um trecho do item logo acima e outro logo
 * abaixo, os dois sobre ele, é a fração.
 */
function hasDrawnFraction(lines: readonly DocLine[], doc: ScanDocument): boolean {
  if (lines.length === 0) return false;
  const pages = new Set(lines.map((line) => line.pageNumber));
  const spans = lines.flatMap((line) =>
    line.spans.filter((span) => span.text.trim() !== "").map((span) => ({ span, page: line.pageNumber })),
  );
  return doc.graphics.some((bar) => {
    const width = bar.x1 - bar.x0;
    if (bar.kind !== "drawing" || !pages.has(bar.pageNumber) || bar.y1 - bar.y0 > 1.2 || width < 2) return false;
    const over = (span: TextSpan) =>
      Math.min(span.x1, bar.x1) - Math.max(span.x0, bar.x0) >= 0.5 * Math.min(span.x1 - span.x0, width);
    const fits = (span: TextSpan) => width <= span.size * 15;
    const above = spans.some(
      ({ span, page }) =>
        page === bar.pageNumber && fits(span) && over(span) &&
        bar.y0 - span.baseline >= span.size * 0.1 && bar.y0 - span.baseline <= span.size * 0.8,
    );
    const below = spans.some(
      ({ span, page }) =>
        page === bar.pageNumber && fits(span) && over(span) &&
        span.baseline - bar.y1 >= span.size * 0.5 && span.baseline - bar.y1 <= span.size * 1.4,
    );
    return above && below;
  });
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
    const own = new Set((lines.length > 0 ? lines : [first]).map((line) => line.id));
    segments = segmentsBetween(doc, positionOf(first), stopLine ? positionOf(stopLine) : null, linesBySlot, own);
    // Um elemento de uma linha colado no seguinte não abre faixa nenhuma: a caixa é a da linha.
    if (segments.length === 0) segments = segmentsOfLines(doc, lines.length > 0 ? lines : [first], linesBySlot);
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
  // A fonte diz se a linha é matemática; o símbolo da área privada diz o mesmo por outro caminho —
  // a fonte de símbolos do livro não parece matemática, e a camada de texto não a lê (importação do
  // Fundamentos, 2026-09-30).
  const needsMath =
    mathChars / chars >= 0.05 ||
    bodyLines.some((line) => line.mathRatio >= 0.5) ||
    hasUnreadableSymbol(text) ||
    hasDrawnFraction(bodyLines, doc);
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
    metadata: record.kind === "CONTENT" ? contentMetadata(record.element.metadata, bodyLines) : record.element.metadata,
    lines: bodyLines,
  };
}

/** O que sobra da linha depois do rótulo do título — vazio quando a linha é só o rótulo. */
function leadText(text: string, label: string): string {
  const trimmed = text.trim();
  return trimmed.startsWith(label) ? trimmed.slice(label.length).trim() : "";
}

/**
 * As palavras que o PDF imprime em negrito no texto, para o corpo guardar (D76).
 *
 * A camada de texto sabe trecho a trecho o que é negrito, e o modelo de visão não é perguntado.
 * Fica de fora o rótulo do item de teoria — "1." é do nó, não do corpo — e o que não tem letra.
 */
function contentMetadata(metadata: OpenElement["metadata"], lines: readonly DocLine[]): OpenElement["metadata"] {
  const leadLabel = typeof metadata["leadLabel"] === "string" ? metadata["leadLabel"] : null;
  const phrases: string[] = [];
  lines.forEach((line, index) => {
    let run: string[] = [];
    const flush = () => {
      const phrase = run.join(" ").replace(/\s+/g, " ").trim();
      run = [];
      if (/\p{L}/u.test(phrase) && !phrases.includes(phrase)) phrases.push(phrase);
    };
    const spans = [...line.spans].sort((a, b) => a.x0 - b.x0);
    spans.forEach((span, position) => {
      const isLabel = index === 0 && position === 0 && leadLabel !== null && span.text.trim() === leadLabel;
      if (span.bold && !span.math && !isLabel) run.push(span.text.trim());
      else flush();
    });
    flush();
  });
  return phrases.length > 0 ? { ...metadata, boldPhrases: phrases } : metadata;
}

const TOC_KINDS = kindsWhere((traits) => traits.inToc);

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

/**
 * O título de subseção com símbolo que a camada de texto não lê — "Conectivo " sem o ∧ (D76).
 *
 * O título certo sai do reconhecimento; até ele rodar, o item diz por que não pode ser aceito às
 * cegas.
 */
function unreadableTitle(draft: DraftItem): ProposedItem["diagnostic"] {
  // Sem nome, o título vem da primeira frase do texto, e é o texto quem passa pelo reconhecimento.
  if (draft.kind !== "SUBSECTION" || draft.title === null || !hasUnreadableSymbol(draft.title)) return null;
  return {
    status: "suspicious",
    reasons: ["o título tem símbolo que o texto do PDF não lê: reconheça o item"],
    facts: { unreadableTitle: true },
  };
}

function finalize(
  draft: DraftItem,
  profile: CaptureProfile,
  doc: ScanDocument | null,
  offset: number | null = null,
): ProposedItem {
  const diagnostic = (doc && profile.validateItem ? profile.validateItem(draft, doc) : null) ?? unreadableTitle(draft);
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

import type { AnchorMatch, CaptureProfile, DraftItem, WalkContext } from "../capture-profile";
import type { DocLine, ScanDocument } from "../document";
import { fromNormalizedBox, overlapRatio } from "../geometry";
import { dividerFromAnchors } from "../layout";
import type { TextLine } from "../page";
import type { Diagnostic, DiagnosticStatus, ScanKind } from "../proposal";
import { foldText } from "../text";
import { semanticPrompt } from "./semantic-prompt";

/**
 * `exam-enem-v1` — caderno do ENEM, com o que o segmentador do TRI aprendeu em 2.775 questões de
 * 30 cadernos (Fase 9 do prompt 03). Não é o Python traduzido: são as decisões dele, no motor daqui.
 *
 * - A âncora é a **linha inteira** "QUESTÃO N" — menção no meio do texto não conta.
 * - O divisor de colunas vem do x dos cabeçalhos, não de um vale de espaço em branco.
 * - As alternativas valem como **sequência** A–E na mesma margem; letra solta não prova nada.
 * - O marco de área encerra a última questão da área, e o marco de língua separa as duas questões
 *   01 do caderno — a identidade é (língua, número), nunca o número sozinho.
 */

const HEADER = /^QUEST[AÃ]O\s+(\d{1,3})$/i;
const AREA = /^(LINGUAGENS|CIENCIAS|MATEMATICA|REDACAO)[A-Z ,]*$/;
const RANGE = /^QUEST(?:OES|AO)\s+DE\s+(\d+)\s+A\s+(\d+)(.*)$/;
const LANGUAGE = /OP[CÇ]AO\s+(INGLES|ESPANHOL)/;
const ALTERNATIVE = /^([A-E])(?:\t|\)|\.|\s|$)/;
const LETTERS = ["A", "B", "C", "D", "E"] as const;

/** A letra da alternativa fica a até isto da margem da coluna (TRI: 16 pt). */
const MARKER_TOLERANCE = 16;
/** As letras de uma sequência ficam alinhadas a até isto umas das outras (TRI: 4 pt). */
const ALIGNMENT_TOLERANCE = 4;

const headerNumber = (line: TextLine): number | null => {
  const match = HEADER.exec(line.text.replace(/\s+/g, " ").trim());
  return match ? Number.parseInt(match[1] ?? "", 10) : null;
};

const CONTAINS: Readonly<Record<string, readonly ScanKind[]>> = {
  ROOT: ["SECTION", "SUBSECTION", "QUESTION"],
  SECTION: ["SUBSECTION", "QUESTION"],
  SUBSECTION: ["QUESTION"],
};

function classify(context: WalkContext): AnchorMatch | null {
  const { line } = context;
  const number = headerNumber(line);

  if (number !== null) {
    const block = [...context.open].reverse().find((element) => element.kind === "SUBSECTION");
    const from = Number(block?.metadata["rangeFrom"]);
    const to = Number(block?.metadata["rangeTo"]);
    const outside = block !== undefined && Number.isFinite(from) && (number < from || number > to);
    const language = !outside ? block?.metadata["language"] : undefined;

    return {
      kind: "QUESTION",
      label: line.text.trim(),
      number: String(number),
      title: null,
      extent: "until-boundary",
      lines: 1,
      confidence: { pattern: 0.97, typography: line.bold ? 0.95 : 0.7 },
      evidence: ["linha inteira “QUESTÃO N”", ...(language ? [`bloco de ${language}`] : [])],
      metadata: {
        ...(language ? { language: String(language) } : {}),
        identity: `${language ? `${language}#` : ""}${number}`,
      },
      // A questão fora da faixa do bloco de língua sai dele: a 06 vem depois do espanhol, mas é da área.
      ...(outside ? { closes: ["SUBSECTION"] as const } : {}),
    };
  }

  const folded = foldText(line.text);

  if (AREA.test(folded)) {
    // O marco pode quebrar em duas linhas ("LINGUAGENS, CÓDIGOS E SUAS" / "TECNOLOGIAS").
    const next = context.peek(1);
    const continues =
      next !== undefined &&
      next.slot === line.slot &&
      next.y0 - line.y1 < context.style.lineSpacing &&
      /^[A-Z ,]+$/.test(foldText(next.text)) &&
      headerNumber(next) === null;
    return {
      kind: "SECTION",
      label: null,
      number: null,
      title: continues ? `${line.text} ${next.text}` : line.text,
      extent: "heading",
      lines: continues ? 2 : 1,
      confidence: { pattern: 0.95, typography: line.bold ? 0.9 : 0.7 },
      evidence: ["marco de área"],
    };
  }

  const range = RANGE.exec(folded);
  if (range) {
    const language = LANGUAGE.exec(range[3] ?? "")?.[1];
    return {
      kind: "SUBSECTION",
      label: null,
      number: null,
      title: line.text,
      extent: "heading",
      lines: 1,
      confidence: { pattern: 0.95 },
      evidence: [language ? `marco de língua (${language.toLowerCase()})` : "faixa de questões"],
      metadata: {
        rangeFrom: Number.parseInt(range[1] ?? "", 10),
        rangeTo: Number.parseInt(range[2] ?? "", 10),
        ...(language ? { language: language === "INGLES" ? "inglês" : "espanhol" } : {}),
      },
    };
  }

  return null;
}

/**
 * A maior sequência A, B, C… alinhada, como o TRI: letra repetida alinhada é pulada (desde 2022 o
 * caderno imprime cada alternativa duas vezes), "A" fora de hora recomeça, o resto zera.
 */
export function longestAlternativeRun(
  lines: readonly DocLine[],
  columnLeftOf: (line: DocLine) => number,
): string[] {
  let best: string[] = [];
  let run: string[] = [];
  let runX = 0;

  for (const line of lines) {
    const letter = ALTERNATIVE.exec(line.text.trim())?.[1];
    if (!letter || line.x0 - columnLeftOf(line) > MARKER_TOLERANCE) continue;

    const aligned = run.length > 0 && Math.abs(line.x0 - runX) <= ALIGNMENT_TOLERANCE;
    const expected = LETTERS[run.length];

    if (aligned && letter === run[run.length - 1]) continue;
    if (aligned && letter === expected) run.push(letter);
    else if (letter === "A") {
      run = ["A"];
      runX = line.x0;
    } else run = [];

    if (run.length > best.length) best = [...run];
  }

  return best;
}

function validate(item: DraftItem, doc: ScanDocument): Diagnostic | null {
  if (item.kind !== "QUESTION") return null;

  const pages = new Map(doc.pages.map((page) => [page.pageNumber, page]));
  const rects = item.regions.flatMap((region) => {
    const page = pages.get(region.pageNumber);
    return page ? [{ pageNumber: region.pageNumber, rect: fromNormalizedBox(region.box, page) }] : [];
  });
  const inside = (line: DocLine) =>
    rects.some(
      (r) => r.pageNumber === line.pageNumber && line.y0 >= r.rect.y0 - 1 && line.y1 <= r.rect.y1 + 1,
    );

  const lines = item.lines.filter(inside);
  const own = item.number;
  const hasHeader = lines.some((line) => String(headerNumber(line)) === own);
  const found = longestAlternativeRun(lines, (line) => doc.slots[line.slot]?.column.x0 ?? line.x0);
  const missing = LETTERS.filter((letter) => !found.includes(letter));
  const intruders = [
    ...new Set(
      lines
        .map(headerNumber)
        .filter((n): n is number => n !== null && String(n) !== own)
        .map(String),
    ),
  ];
  const hasGraphic = doc.graphics.some((graphic) =>
    rects.some((r) => r.pageNumber === graphic.pageNumber && overlapRatio(graphic, r.rect) > 0.5),
  );
  const crossesColumn = item.regions.length > 1;
  const crossesPage = new Set(item.regions.map((region) => region.pageNumber)).size > 1;
  const alternativesAsImage = missing.length > 0 && hasGraphic;

  const reasons: string[] = [];
  if (!hasHeader) reasons.push("cabeçalho fora da região");
  if (missing.length > 0) reasons.push(`alternativas sem texto: ${missing.join(", ")}`);
  intruders.forEach((n) => reasons.push(`outra questão dentro: ${n}`));

  let status: DiagnosticStatus = "incomplete";
  if (hasHeader && missing.length === 0 && intruders.length === 0) status = "complete";
  else if (intruders.length > 0 || !hasHeader) status = "suspicious";
  else if (alternativesAsImage) status = "insufficient_evidence";

  return {
    status,
    reasons,
    facts: {
      hasHeader,
      alternativesFound: found,
      alternativesMissing: missing,
      otherQuestionInside: intruders,
      hasGraphic,
      crossesColumn,
      crossesPage,
    },
  };
}

export const examEnemV1: CaptureProfile = {
  id: "exam-enem-v1",
  version: 1,
  label: "Prova do ENEM",
  documentKind: "EXAM",
  description:
    "Cadernos do ENEM: QUESTÃO N em linha própria, duas colunas, alternativas A–E, marcos de área e blocos de inglês e espanhol com a mesma numeração.",
  kinds: ["SECTION", "SUBSECTION", "QUESTION"],
  settings: {
    answersLocation: "NONE",
    columns: 2,
    defaultQuestionType: "MULTIPLE_CHOICE",
    visionModel: null,
    emitContent: false,
    autoAcceptThreshold: 0.9,
  },
  markers: {
    questionStart: [HEADER],
    solution: [],
    headings: [AREA, RANGE],
    exerciseBlock: [],
  },

  classifyLine: classify,

  canContain(parent, child) {
    return (CONTAINS[parent ?? "ROOT"] ?? []).includes(child);
  },

  isProtected(line) {
    return headerNumber(line) !== null;
  },

  columnHints(lines) {
    const divider = dividerFromAnchors(lines.filter((line) => headerNumber(line) !== null).map((line) => line.x0));
    return divider === null ? [] : [divider];
  },

  validateItem: validate,

  buildSemanticPrompt: (input) =>
    semanticPrompt(
      input,
      "O documento é um caderno do ENEM. Decida se o trecho pertence à questão proposta ou à seguinte, e se uma figura é parte da questão.",
    ),
};

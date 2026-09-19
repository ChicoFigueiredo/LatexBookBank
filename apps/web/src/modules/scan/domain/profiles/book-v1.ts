import type { AnchorMatch, CaptureProfile, LearnedStyle, WalkContext } from "../capture-profile";
import type { DocLine } from "../document";
import type { TextLine } from "../page";
import type { ScanKind } from "../proposal";
import { letterIndex, romanToNumber, stripAccents } from "../text";
import { normalizeNumber } from "../toc";
import {
  looksLikeHeading,
  relativeSize,
  typographicSignature,
  type PublicationStyle,
} from "../typography";
import { semanticPrompt } from "./semantic-prompt";

/**
 * `book-v1` — livro-texto: partes, capítulos, seções, exemplos, blocos de exercícios, exercícios
 * e seus itens (§15 e §16 do prompt 03).
 *
 * Cada padrão pede **duas** evidências: a forma do texto e a da tipografia ou da sequência. "4
 * Funções" só é capítulo em corpo de título; "1." só é exercício dentro de um bloco de exercícios e
 * na sequência do anterior; "a)" só é item dentro de um exercício. Uma regex sozinha acha
 * capítulo em toda linha que começa com número — foi o defeito do PR #201.
 *
 * O vocabulário é configurável por língua: as palavras estão nas listas abaixo, não espalhadas
 * pelas regras.
 */

const WORDS = {
  part: ["parte", "part"],
  chapter: ["capitulo", "chapter", "unidade", "unit"],
  example: ["exemplo", "example", "ejemplo", "exemple"],
  exercise: ["exercicio", "exercise", "problema", "problem", "ejercicio"],
  exerciseGroup: [
    "exercicios",
    "exercicios propostos",
    "exercicios resolvidos",
    "exercicios complementares",
    "lista de exercicios",
    "problemas",
    "problemas propostos",
    "exercises",
    "problems",
    "ejercicios",
  ],
  note: ["nota", "observacao", "obs", "note", "remark"],
} as const;

const alternatives = (words: readonly string[]) => words.map((w) => w.replace(/\s+/g, "\\s+")).join("|");

/** Tudo comparado sem acento: "Capítulo" e "Capitulo" são a mesma palavra impressa de dois jeitos. */
const PART = new RegExp(`^(?:${alternatives(WORDS.part)})\\s+([ivxlc]+|\\d+)\\b[.:]?\\s*(.*)$`, "i");
const CHAPTER = new RegExp(`^(?:${alternatives(WORDS.chapter)})\\s+(\\d+|[ivxlc]+)\\b[.:]?\\s*(.*)$`, "i");
const NUMBERED_HEADING = /^(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+(\p{L}.*)$/u;
const EXAMPLE = new RegExp(`^(${alternatives(WORDS.example)})\\s+(\\d+(?:\\.\\d+)*)\\s*[.:)]?\\s*(.*)$`, "i");
const EXERCISE = new RegExp(`^(${alternatives(WORDS.exercise)})\\s+(\\d+(?:\\.\\d+)*)\\s*[.:)]?\\s*(.*)$`, "i");
const EXERCISE_GROUP = new RegExp(`^(?:${alternatives(WORDS.exerciseGroup)})[.:]?$`, "i");
const NOTE = new RegExp(`^(${alternatives(WORDS.note)})[.:]\\s*(.*)$`, "i");
const NUMBERED_ITEM = /^(\d{1,3})[.)](?:\s+|$)(.*)$/;
const LETTER_ITEM = /^\(?([a-z])\)(?:\s+|$)(.*)$/;
const ROMAN_ITEM = /^\(?([ivx]{1,5})\)(?:\s+|$)(.*)$/i;

/** A marca, no estilo aprendido, de que o livro numera as seções com um número só. */
const SECTIONS_BY_SINGLE_NUMBER = "@sections-by-single-number";

/** Quanto um número de exercício pode "pular" e ainda ser a sequência (exercício omitido na edição). */
const MAX_NUMBER_JUMP = 3;
/** Distância, em pontos, para duas âncoras irmãs estarem "na mesma margem". */
const ALIGNMENT = 4;

const CONTAINS: Readonly<Record<string, readonly ScanKind[]>> = {
  ROOT: ["PART", "CHAPTER", "SECTION", "EXERCISE_GROUP"],
  PART: ["CHAPTER"],
  CHAPTER: ["SECTION", "CONTENT", "EXAMPLE", "EXERCISE_GROUP", "EXERCISE", "NOTE", "FIGURE"],
  SECTION: ["SUBSECTION", "CONTENT", "EXAMPLE", "EXERCISE_GROUP", "EXERCISE", "NOTE", "FIGURE"],
  SUBSECTION: ["CONTENT", "EXAMPLE", "EXERCISE_GROUP", "EXERCISE", "NOTE", "FIGURE"],
  EXERCISE_GROUP: ["EXERCISE"],
  EXERCISE: ["ITEM", "FIGURE"],
  QUESTION: ["ITEM", "FIGURE"],
  EXAMPLE: ["FIGURE"],
  ITEM: ["SUBITEM"],
};

const fold = (line: TextLine) => stripAccents(line.text).trim();

function emphasizedPrefix(line: TextLine): boolean {
  const first = line.spans[0];
  return Boolean(first && (first.bold || first.italic));
}

function headingTypography(line: TextLine, style: PublicationStyle): number {
  const ratio = relativeSize(line, style);
  if (ratio >= 1.3) return line.bold ? 0.98 : 0.9;
  if (ratio >= 1.1) return line.bold ? 0.92 : 0.75;
  return line.bold ? 0.8 : 0.4;
}

/** O título que vem na linha seguinte ("Capítulo 1" / "Números reais"): grande, e logo abaixo. */
function titleBelow(context: WalkContext): { readonly text: string; readonly lines: number } | null {
  const { line, style } = context;
  const parts: DocLine[] = [];
  let previous: DocLine = line;

  // O título pode quebrar em duas ou três linhas do mesmo corpo ("Conjuntos Finitos, /
  // Enumeráveis e Não-Enumeráveis"); a primeira tem de vir logo abaixo do rótulo.
  for (let offset = 1; offset <= 3; offset++) {
    const next = context.peek(offset);
    if (!next || next.slot !== line.slot) break;
    const limit = parts.length === 0 ? style.lineSpacing * 5 : next.size * 0.8;
    if (next.y0 - previous.y1 > limit) break;
    if (relativeSize(next, style) < 1.3 || !looksLikeHeading(next, style)) break;
    if (parts[0] && Math.abs(next.size - parts[0].size) > 0.5) break;
    parts.push(next);
    previous = next;
  }

  return parts.length > 0 ? { text: parts.map((part) => part.text).join(" "), lines: parts.length } : null;
}

function heading(
  context: WalkContext,
  kind: ScanKind,
  label: string,
  number: string | null,
  inlineTitle: string,
  pattern: number,
  evidence: string,
): AnchorMatch {
  const below = inlineTitle.trim() === "" ? titleBelow(context) : null;
  return {
    kind,
    label,
    number,
    title: below?.text ?? (inlineTitle.trim() || null),
    extent: "heading",
    lines: below ? below.lines + 1 : 1,
    confidence: { pattern, typography: headingTypography(context.line, context.style) },
    evidence: [evidence, `corpo ${relativeSize(context.line, context.style).toFixed(2)}× o do livro`],
  };
}

function sequenceConfidence(previous: string | null, current: number): number | null {
  const last = previous === null ? null : Number.parseInt(previous, 10);
  if (last === null || !Number.isInteger(last)) return current === 1 ? 0.95 : 0.7;
  if (current === last + 1) return 0.97;
  if (current > last && current <= last + MAX_NUMBER_JUMP) return 0.7;
  return null;
}

function classify(context: WalkContext): AnchorMatch | null {
  const { line, style } = context;
  const text = fold(line);
  const openKinds = new Set(context.open.map((element) => element.kind));
  const headingLike = looksLikeHeading(line, style);

  const part = PART.exec(text);
  if (part && headingLike) {
    return heading(context, "PART", line.text, normalizeNumber(part[1] ?? ""), part[2] ?? "", 0.95, "padrão de parte");
  }

  const chapter = CHAPTER.exec(text);
  if (chapter && headingLike && relativeSize(line, style) >= 1.1) {
    return heading(context, "CHAPTER", line.text, normalizeNumber(chapter[1] ?? ""), chapter[2] ?? "", 0.97, "padrão de capítulo");
  }

  const numbered = NUMBERED_HEADING.exec(line.text.trim());
  if (numbered && headingLike && (line.bold || relativeSize(line, style) >= 1.15)) {
    const number = numbered[1] ?? "";
    const depth = number.split(".").length;
    // No livro que escreve "Capítulo I" por extenso e numera as seções com um número só ("1
    // Conjuntos"), o número sozinho é seção; nos outros ("4 Funções", "1.1 …"), é capítulo.
    const wordChapters = context.learned.get(SECTIONS_BY_SINGLE_NUMBER) === "SECTION";
    const levels: readonly ScanKind[] = wordChapters ? ["SECTION", "SUBSECTION", "SUBSECTION"] : ["CHAPTER", "SECTION", "SUBSECTION"];
    const kind: ScanKind = levels[Math.min(depth, levels.length) - 1] ?? "SUBSECTION";
    if (kind !== "CHAPTER" || relativeSize(line, style) >= 1.3) {
      // "1.2" dentro do capítulo 1 (ou da seção 1, quando o capítulo é por extenso) é continuidade;
      // dentro do 3, é suspeita.
      const parentKind: ScanKind = wordChapters ? "SECTION" : "CHAPTER";
      const parentNumber = [...context.open].reverse().find((e) => e.kind === parentKind)?.number;
      const continuity = parentNumber && depth > 1 ? (number.startsWith(`${parentNumber}.`) ? 0.97 : 0.6) : undefined;
      return {
        ...heading(context, kind, number, number, numbered[2] ?? "", 0.9, "título numerado"),
        title: numbered[2] ?? null,
        lines: 1,
        confidence: {
          pattern: 0.9,
          typography: headingTypography(line, style),
          ...(continuity !== undefined ? { continuity } : {}),
        },
      };
    }
  }

  if (EXERCISE_GROUP.test(text) && (headingLike || line.bold)) {
    return heading(context, "EXERCISE_GROUP", line.text, null, line.text, 0.92, "bloco de exercícios");
  }

  const example = EXAMPLE.exec(text);
  if (example && emphasizedPrefix(line)) {
    return {
      kind: "EXAMPLE",
      label: `${line.text.slice(0, (example[1] ?? "").length)} ${example[2] ?? ""}`.trim(),
      number: example[2] ?? null,
      title: null,
      // Um bloco, e não um parágrafo (D56). Como negrito no corpo da seção, um parágrafo bastava:
      // a resolução vinha logo abaixo e ninguém notava a emenda. Como nó, o exemplo que deixa a
      // resolução para trás promete na árvore o que não entrega ao abrir. E `until-boundary` seria
      // ganancioso demais — engoliria a teoria que volta depois, que não tem título nenhum.
      extent: "block",
      lines: 1,
      confidence: { pattern: 0.92, typography: 0.9 },
      evidence: ["rótulo de exemplo em destaque"],
    };
  }

  const exercise = EXERCISE.exec(text);
  if (exercise && emphasizedPrefix(line)) {
    return {
      kind: "EXERCISE",
      label: `${line.text.slice(0, (exercise[1] ?? "").length)} ${exercise[2] ?? ""}`.trim(),
      number: exercise[2] ?? null,
      title: null,
      extent: "until-boundary",
      lines: 1,
      confidence: { pattern: 0.92, typography: 0.9 },
      evidence: ["rótulo de exercício em destaque"],
    };
  }

  const note = NOTE.exec(text);
  if (note && emphasizedPrefix(line)) {
    return {
      kind: "NOTE",
      label: note[1] ?? null,
      number: null,
      title: null,
      extent: "paragraph",
      lines: 1,
      confidence: { pattern: 0.85, typography: 0.85 },
      evidence: ["rótulo de nota em destaque"],
    };
  }

  const item = NUMBERED_ITEM.exec(line.text.trim());
  if (item && openKinds.has("EXERCISE_GROUP")) {
    const number = Number.parseInt(item[1] ?? "", 10);
    const previous = context.lastSibling("EXERCISE");
    const sequence = sequenceConfidence(previous?.number ?? null, number);
    // Numeração alinhada pela direita: o "10." começa meio corpo antes do "9.".
    const digitsDiff = previous ? Math.abs(String(number).length - (previous.number ?? "").length) : 0;
    const aligned = previous
      ? Math.abs(previous.anchor.x0 - line.x0) <= ALIGNMENT + digitsDiff * style.bodySize * 0.6
      : line.x0 <= context.columnLeft + style.bodySize * 3;
    if (sequence !== null && aligned) {
      return {
        kind: "EXERCISE",
        label: `${number}.`,
        number: String(number),
        title: null,
        extent: "until-boundary",
        lines: 1,
        confidence: {
          pattern: 0.85,
          continuity: sequence,
          layout: previous ? 0.95 : 0.8,
          ...(emphasizedPrefix(line) ? { typography: 0.9 } : {}),
        },
        evidence: [
          "número no início da linha, dentro de um bloco de exercícios",
          previous ? `segue o ${previous.number} na mesma margem` : "primeiro do bloco",
        ],
      };
    }
  }

  const insideExercise = context.open.at(-1);
  const roman = ROMAN_ITEM.exec(line.text.trim());
  if (roman && openKinds.has("ITEM")) {
    const value = romanToNumber(roman[1] ?? "");
    const previous = context.lastSibling("SUBITEM");
    const expected = previous ? (romanToNumber(previous.number ?? "") ?? 0) + 1 : 1;
    if (value === expected) {
      return {
        kind: "SUBITEM",
        label: `${roman[1]})`,
        number: roman[1] ?? null,
        title: null,
        extent: "until-boundary",
        lines: 1,
        confidence: { pattern: 0.85, continuity: 0.95 },
        evidence: ["numeração romana em sequência dentro de um item"],
      };
    }
  }

  const letter = LETTER_ITEM.exec(line.text.trim());
  if (letter && (openKinds.has("EXERCISE") || openKinds.has("QUESTION")) && insideExercise) {
    const previous = context.lastSibling("ITEM");
    const expected = previous ? letterIndex(previous.number ?? "a") + 1 : 0;
    const owner = [...context.open].reverse().find((e) => e.kind === "EXERCISE" || e.kind === "QUESTION");
    const indented = !owner || line.x0 >= owner.anchor.x0 - ALIGNMENT;
    if (letterIndex(letter[1] ?? "") === expected && indented) {
      return {
        kind: "ITEM",
        label: `${letter[1]})`,
        number: letter[1] ?? null,
        title: null,
        extent: "until-boundary",
        lines: 1,
        confidence: { pattern: 0.85, continuity: 0.95 },
        evidence: ["letra em sequência dentro de um exercício"],
      };
    }
  }

  // Título sem padrão, reconhecido pela tipografia que o livro já mostrou para aquele nível — só
  // depois que a estrutura começou: antes dela, título grande é prefácio, sumário, dedicatória.
  if (context.open.length > 0 && headingLike && line.text.length <= 80 && !/[.;:,]$/.test(line.text)) {
    const learned = context.learned.get(typographicSignature(line, style));
    if (learned === "SECTION" || learned === "SUBSECTION" || learned === "CHAPTER") {
      return {
        kind: learned,
        label: null,
        number: null,
        title: line.text,
        extent: "heading",
        lines: 1,
        confidence: { pattern: 0.45, typography: 0.8 },
        evidence: ["mesma tipografia dos títulos numerados deste livro, sem número"],
      };
    }
  }

  return null;
}

export const bookV1: CaptureProfile = {
  id: "book-v1",
  version: 1,
  label: "Livro-texto",
  documentKind: "BOOK",
  description:
    "Partes, capítulos, seções e subseções; exemplos; blocos de exercícios com exercícios numerados e itens a), b), (i). A teoria vira conteúdo da seção.",
  kinds: [
    "PART",
    "CHAPTER",
    "SECTION",
    "SUBSECTION",
    "CONTENT",
    "EXAMPLE",
    "EXERCISE_GROUP",
    "EXERCISE",
    "ITEM",
    "SUBITEM",
    "NOTE",
    "FIGURE",
  ],
  settings: {
    answersLocation: "END_OF_BOOK",
    columns: "auto",
    defaultQuestionType: "DISCURSIVE",
    visionModel: null,
    emitContent: true,
    autoAcceptThreshold: 0.85,
  },
  markers: {
    questionStart: [NUMBERED_ITEM, EXERCISE],
    solution: [/^(solu[çc][ãa]o|resolu[çc][ãa]o|solution)[.:]?/i],
    headings: [PART, CHAPTER, NUMBERED_HEADING],
    exerciseBlock: [EXERCISE_GROUP],
  },

  classifyLine: classify,

  canContain(parent, child) {
    return (CONTAINS[parent ?? "ROOT"] ?? []).includes(child);
  },

  isProtected(line, style) {
    const text = fold(line);
    return (
      (line.bold || relativeSize(line, style) >= 1.1) &&
      (PART.test(text) || CHAPTER.test(text) || EXERCISE_GROUP.test(text))
    );
  },

  learnStyle(lines: readonly DocLine[], style: PublicationStyle): LearnedStyle {
    const learned = new Map<string, ScanKind>();
    // "Capítulo I" por extenso **e** títulos de um número só: as seções são numeradas dentro do
    // capítulo. Com "Capítulo 1" e seções "1.1" (o `book` do LaTeX), a numeração é a de sempre.
    const hasWordChapters = lines.some((line) => CHAPTER.test(fold(line)) && looksLikeHeading(line, style));
    const hasSingleNumberHeadings = lines.some((line) => {
      const numbered = NUMBERED_HEADING.exec(line.text.trim());
      return numbered !== null && !(numbered[1] ?? "").includes(".") && line.bold && looksLikeHeading(line, style);
    });
    const wordChapters = hasWordChapters && hasSingleNumberHeadings;
    if (wordChapters) learned.set(SECTIONS_BY_SINGLE_NUMBER, "SECTION");
    const levels: readonly ScanKind[] = wordChapters ? ["SECTION", "SUBSECTION", "SUBSECTION"] : ["CHAPTER", "SECTION", "SUBSECTION"];

    for (const line of lines) {
      const numbered = NUMBERED_HEADING.exec(line.text.trim());
      if (!numbered || !looksLikeHeading(line, style)) continue;
      const depth = (numbered[1] ?? "").split(".").length;
      const kind = levels[Math.min(depth, levels.length) - 1] ?? "SUBSECTION";
      const signature = typographicSignature(line, style);
      if (!learned.has(signature)) learned.set(signature, kind);
    }
    return learned;
  },

  buildSemanticPrompt: (input) =>
    semanticPrompt(
      input,
      "O documento é um livro-texto de matemática. Distinga teoria (CONTENT), exemplo resolvido (EXAMPLE), exercício proposto (EXERCISE) e nota (NOTE).",
    ),
};

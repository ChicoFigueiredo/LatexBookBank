import {
  MathRecognitionError,
  type MathRecognitionProvider,
} from "@shared/ports/math-recognition";

import { kindsWhere, SCAN_KIND_TRAITS } from "@modules/scan/domain/proposal";
import { buildLines } from "@modules/scan/domain/page";
import { chunkBoxes, textInside, type ChunkLine } from "@modules/scan/domain/recognition-chunks";
import { chunkAgrees, driftDiagnostic, layerLatex, recognitionDrift } from "@modules/scan/domain/recognition-drift";
import type { MathResult, ScanItem } from "@modules/scan/domain/scan-item";

import type { NormalizedBox } from "@/shared/geometry/normalized-box";

import type { OpenedPdf } from "./pdf-document";
import type { MathPass } from "./run-scan";

/**
 * O reconhecimento matemático sob medida (Fase 6 do prompt 03, §22, §23, D52).
 *
 * O mesmo `MathRecognitionProvider` da captura — nenhum mecanismo paralelo. Vai ao modelo só o
 * item cuja camada de texto não representa a matemática (`needsMath`), ou todos quando a pessoa
 * pede; e vai **por âncora**: um exercício que vira a página são duas imagens, reconhecidas em
 * ordem e juntadas, nunca um recorte gigante atravessando as duas.
 *
 * Item e subitem ficam de fora: o exercício que os contém já os reconhece inteiros.
 */

const RECOGNIZED_KINDS = kindsWhere((traits) => traits.recognizesMath);
const DPI = 200;

/** A altura máxima de um pedaço, na fração da página: umas oito linhas do corpo do livro. */
const MAX_CHUNK_HEIGHT = 0.12;

/** As linhas de texto da página, na fração da página: é entre elas que o recorte se corta. */
async function linesOf(pdf: OpenedPdf, pageNumber: number): Promise<ChunkLine[]> {
  const page = buildLines(await pdf.readPage(pageNumber));
  return page.lines.map((line) => ({
    y0: line.y0 / page.height,
    y1: line.y1 / page.height,
    x0: line.x0 / page.width,
    x1: line.x1 / page.width,
    text: line.text,
  }));
}


/** Espaço de sobra: metade da altura típica de uma linha — mais que a entrelinha de um parágrafo. */
function minGapOf(lines: readonly ChunkLine[]): number {
  const heights = lines.map((line) => line.y1 - line.y0).sort((a, b) => a - b);
  return (heights[Math.floor(heights.length / 2)] ?? 0.012) * 0.5;
}

/** O pedaço tem alguma linha da camada de texto — mascarada ou não. */
const hasLayer = (chunk: NormalizedBox, lines: readonly ChunkLine[]): boolean =>
  lines.some((line) => {
    const y = (line.y0 + line.y1) / 2;
    return y >= chunk.y && y <= chunk.y + chunk.height;
  });

/**
 * A máscara sem as linhas de texto que só encostam na figura (D78): a linha cujo meio está fora
 * da figura é do texto, e não rótulo dela. No exercício 54 do vol. 1, a máscara do diagrama de
 * Venn ao lado apagava o fim de "representados abaixo, e sabendo que".
 */
function carve(masks: readonly NormalizedBox[], lines: readonly ChunkLine[]): NormalizedBox[] {
  return masks.flatMap((mask) => {
    const inside = (x: number, y: number) => x >= mask.x && x <= mask.x + mask.width && y >= mask.y && y <= mask.y + mask.height;
    const kept = lines.filter((line) => {
      const touches = line.y0 < mask.y + mask.height && line.y1 > mask.y && (line.x0 ?? 0) < mask.x + mask.width && (line.x1 ?? 1) > mask.x;
      return touches && !inside(((line.x0 ?? 0) + (line.x1 ?? 1)) / 2, (line.y0 + line.y1) / 2);
    });
    // O que sobra da máscara entre as faixas dessas linhas.
    let pieces: NormalizedBox[] = [mask];
    for (const line of kept) {
      pieces = pieces.flatMap((piece) => {
        const top = piece.y;
        const bottom = piece.y + piece.height;
        if (line.y1 <= top || line.y0 >= bottom) return [piece];
        return [
          ...(line.y0 > top ? [{ ...piece, height: line.y0 - top }] : []),
          ...(line.y1 < bottom ? [{ ...piece, y: line.y1, height: bottom - line.y1 }] : []),
        ];
      });
    }
    return pieces;
  });
}

const overlaps = (a: NormalizedBox, b: NormalizedBox): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * As figuras que saem do recorte de um item (D78): as que são itens próprios, e não o próprio item.
 * O recorte do texto cobre do começo à próxima fronteira, e a tabela-verdade no meio dele era
 * transcrita duas vezes — no texto e na figura.
 */
const figuresAround = (item: ScanItem, all: readonly ScanItem[]): ScanItem[] =>
  all.filter((other) => other.kind === "FIGURE" && other.key !== item.key && other.reviewState !== "REJECTED");

/**
 * O diagnóstico depois do reconhecimento: o que o perfil disse, e — quando o modelo diverge do PDF
 * nos números — o porquê de conferir (D78). Reconhecer de novo sem divergência tira o aviso.
 * A tabela fica de fora: as células dela já vêm da camada de texto.
 */
function diagnosticAfter(item: ScanItem, latex: string): ScanItem["diagnostic"] {
  const previous = item.diagnostic?.reasons.some((reason) => reason.startsWith(DRIFT)) ? null : item.diagnostic;
  const drift = item.kind === "FIGURE" ? null : recognitionDrift(item.text, latex);
  if (drift === null) return previous;
  const found = driftDiagnostic(drift);
  return previous === null || previous.status === "complete"
    ? found
    : { ...previous, reasons: [...previous.reasons, ...found.reasons], facts: { ...previous.facts, ...found.facts } };
}
const DRIFT = "o reconhecimento difere do PDF";

/** A figura que é tabela (D78): o reconhecimento preenche só a célula que a camada de texto não lê. */
const isTable = (item: ScanItem): boolean => item.kind === "FIGURE" && Array.isArray(item.metadata["tableRows"]);

export async function recognizeItem(
  recognizer: MathRecognitionProvider,
  pdf: OpenedPdf,
  item: Pick<ScanItem, "regions">,
  now: () => Date = () => new Date(),
  figures: readonly Pick<ScanItem, "regions">[] = [],
): Promise<MathResult> {
  const parts: MathResult[] = [];
  const pageLines = new Map<number, ChunkLine[]>();

  for (const region of item.regions) {
    // Em pedaços de poucas linhas: o modelo perde o detalhe num recorte grande (D78).
    if (!pageLines.has(region.pageNumber)) pageLines.set(region.pageNumber, await linesOf(pdf, region.pageNumber));
    const lines = pageLines.get(region.pageNumber)!;
    const masks = carve(
      figures.flatMap((figure) =>
        figure.regions.filter((mask) => mask.pageNumber === region.pageNumber && overlaps(mask.box, region.box)).map((mask) => mask.box),
      ),
      lines,
    );
    const chunks = chunkBoxes(region.box, lines, { maxHeight: MAX_CHUNK_HEIGHT, minGap: minGapOf(lines) });
    const latex: string[] = [];
    let last: Awaited<ReturnType<MathRecognitionProvider["recognize"]>> | null = null;
    const recognizeChunk = async (chunk: NormalizedBox) => {
      const image = await pdf.renderRegion(region.pageNumber, chunk, DPI, masks);
      last = await recognizer.recognize({ image, mimeType: "image/png", mode: "mixed" });
      return last.latex.trim();
    };
    for (const chunk of chunks) {
      let piece = await recognizeChunk(chunk);
      /*
        O pedaço que não concorda com a camada de texto é invenção: uma tabela-verdade que o livro
        não tem (p. 18 do vol. 1), uma página inteira sobre outro assunto (p. 46), a pergunta do
        exercício trocada (exercício 51). Uma vez, de novo, em metades — o recorte menor é o que o
        modelo lê melhor. Se ainda não concorda, fica o texto da camada do PDF: perde o símbolo
        que ela não lê, mas não inventa.
      */
      const expected = textInside(chunk, lines, masks);
      // Sem camada de texto no pedaço — a página escaneada —, o modelo é a única leitura.
      if (hasLayer(chunk, lines) && !chunkAgrees(expected, piece)) {
        const halves = chunkBoxes(chunk, lines, { maxHeight: chunk.height / 2, minGap: minGapOf(lines) });
        const retried: string[] = [];
        for (const half of halves.length > 1 ? halves : [chunk]) {
          const part = await recognizeChunk(half);
          const own = textInside(half, lines, masks);
          retried.push(!hasLayer(half, lines) || chunkAgrees(own, part) ? part : layerLatex(own));
        }
        piece = retried.filter((part) => part !== "").join("\n\n");
      }
      latex.push(piece);
    }
    const result = { ...last!, latex: latex.filter((piece) => piece !== "").join("\n\n") };
    parts.push({
      latex: result.latex,
      confidence: result.confidence,
      alternatives: result.alternatives,
      providerId: result.providerId,
      model: result.model,
      durationMs: result.durationMs,
      recognizedAt: now().toISOString(),
    });
  }

  const confidences = parts.map((part) => part.confidence).filter((c): c is number => c !== null);
  const first = parts[0];

  return {
    latex: parts.map((part) => part.latex.trim()).join("\n\n"),
    confidence: confidences.length > 0 ? Math.min(...confidences) : null,
    alternatives: parts.length === 1 ? (first?.alternatives ?? []) : [],
    providerId: first?.providerId ?? recognizer.id,
    model: first?.model ?? "",
    durationMs: parts.reduce((sum, part) => sum + part.durationMs, 0),
    recognizedAt: now().toISOString(),
  };
}

export function createMathPass(recognizer: MathRecognitionProvider, model: string): MathPass {
  return {
    providerId: recognizer.id,
    model,
    async run({ items, figures, pdf, policy, save, cancelled, progress }) {
      const known = figures ?? items;
      const targets = items.filter(
        (item) =>
          (RECOGNIZED_KINDS.has(item.kind) || isTable(item)) &&
          // O título sem nome é só o rótulo: o parágrafo que emenda nele é reconhecido no texto (D76).
          !(SCAN_KIND_TRAITS[item.kind].heading && item.title === null) &&
          item.reviewState !== "REJECTED" &&
          item.mathResult === null &&
          item.regions.length > 0 &&
          (policy === "always" || item.needsMath),
      );

      const warnings: string[] = [];
      let calls = 0;

      await progress?.(0, targets.length);

      for (const [index, item] of targets.entries()) {
        if (await cancelled()) break;
        if (index > 0) await progress?.(index, targets.length);
        try {
          const mathResult = await recognizeItem(recognizer, pdf, item, undefined, figuresAround(item, known));
          calls += item.regions.length;
          // A saída do modelo é candidata, não conteúdo (CONTEXT.md, *Reconhecimento*): o item
          // sugerido volta a pedir revisão, a mesma regra do reprocessar à mão (#250, SPG-07).
          // Sem isto, "Aprovar com sugeridos" levava ao acervo LaTeX que ninguém abriu.
          const reviewState = item.reviewState === "AUTO_ACCEPTABLE" ? "NEEDS_REVIEW" : item.reviewState;
          await save({ upserts: [{ ...item, mathResult, reviewState, diagnostic: diagnosticAfter(item, mathResult.latex) }], deletedIds: [] });
        } catch (error) {
          if (!(error instanceof MathRecognitionError)) throw error;
          calls += 1;
          // Um item que o modelo não leu não para o lote: fica sem LaTeX, com o motivo no relatório.
          warnings.push(`${item.originalLabel ?? item.kind} (p. ${item.pageNumber}): ${error.message}`);
        }
      }

      await progress?.(targets.length, targets.length);
      return { calls, warnings };
    },
  };
}

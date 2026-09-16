import {
  MathRecognitionError,
  type MathRecognitionProvider,
} from "@shared/ports/math-recognition";

import type { ScanKind } from "@modules/scan/domain/proposal";
import type { MathResult, ScanItem } from "@modules/scan/domain/scan-item";

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

const RECOGNIZED_KINDS: ReadonlySet<ScanKind> = new Set(["EXERCISE", "QUESTION", "EXAMPLE", "CONTENT", "NOTE"]);
const DPI = 200;

export async function recognizeItem(
  recognizer: MathRecognitionProvider,
  pdf: OpenedPdf,
  item: ScanItem,
  now: () => Date = () => new Date(),
): Promise<MathResult> {
  const parts: MathResult[] = [];

  for (const region of item.regions) {
    const image = await pdf.renderRegion(region.pageNumber, region.box, DPI);
    const result = await recognizer.recognize({ image, mimeType: "image/png", mode: "mixed" });
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
    async run({ items, pdf, policy, save, cancelled, progress }) {
      const targets = items.filter(
        (item) =>
          RECOGNIZED_KINDS.has(item.kind) &&
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
          const mathResult = await recognizeItem(recognizer, pdf, item);
          calls += item.regions.length;
          await save({ upserts: [{ ...item, mathResult }], deletedIds: [] });
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

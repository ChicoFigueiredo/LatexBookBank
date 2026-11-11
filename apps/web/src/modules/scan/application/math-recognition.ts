import {
  MathRecognitionError,
  type MathRecognitionProvider,
} from "@shared/ports/math-recognition";

import { kindsWhere, SCAN_KIND_TRAITS } from "@modules/scan/domain/proposal";
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

const overlaps = (a: NormalizedBox, b: NormalizedBox): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * As figuras que saem do recorte de um item (D78): as que são itens próprios, e não o próprio item.
 * O recorte do texto cobre do começo à próxima fronteira, e a tabela-verdade no meio dele era
 * transcrita duas vezes — no texto e na figura.
 */
const figuresAround = (item: ScanItem, all: readonly ScanItem[]): ScanItem[] =>
  all.filter((other) => other.kind === "FIGURE" && other.key !== item.key && other.reviewState !== "REJECTED");

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

  for (const region of item.regions) {
    const masks = figures.flatMap((figure) =>
      figure.regions.filter((mask) => mask.pageNumber === region.pageNumber && overlaps(mask.box, region.box)).map((mask) => mask.box),
    );
    const image = await pdf.renderRegion(region.pageNumber, region.box, DPI, masks);
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
          await save({ upserts: [{ ...item, mathResult, reviewState }], deletedIds: [] });
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

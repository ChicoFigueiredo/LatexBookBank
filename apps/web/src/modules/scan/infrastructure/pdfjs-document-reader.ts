import "server-only";

import { createRequire } from "node:module";
import path from "node:path";

import type { NormalizedBox } from "@modules/assets/domain/source-anchor";
import type { OpenedPdf, PdfDocumentOpener } from "@modules/scan/application/pdf-document";
import type { Graphic, RawPage, RawSpan } from "@modules/scan/domain/page";
import type * as PdfJsModule from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * O PDF lido no servidor, com o mesmo pdf.js que a tela usa (D49).
 *
 * Três coisas saem daqui, e nenhuma exige rasterizar a página (§23 do prompt 03): os trechos de
 * texto com fonte e posição, as imagens e os desenhos vetoriais — estes dois pela lista de
 * operadores, acompanhando a matriz de transformação corrente. Rasterizar só acontece quando
 * alguém pede um trecho em PNG, para reconhecer ou recortar.
 */

type PdfJs = typeof PdfJsModule;

let pdfjsPromise: Promise<PdfJs> | null = null;

/**
 * O canvas nativo entra **antes** do pdf.js: o renderizador procura `Path2D`, `DOMMatrix` e
 * `ImageData` no escopo global, e no Node eles só existem se alguém os puser lá. Sem isso, a
 * leitura funciona e o primeiro recorte falha com um erro de tipo que não cita o canvas.
 */
async function load(): Promise<PdfJs> {
  const canvas = await import("@napi-rs/canvas");
  const scope = globalThis as Record<string, unknown>;
  scope["Path2D"] ??= canvas.Path2D;
  scope["DOMMatrix"] ??= canvas.DOMMatrix;
  scope["ImageData"] ??= canvas.ImageData;

  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

const loadPdfJs = (): Promise<PdfJs> => (pdfjsPromise ??= load());

/** As pastas de fontes padrão e CMaps, resolvidas a partir do pacote — nunca caminho literal. */
function assetDirs(): { standardFontDataUrl: string; cMapUrl: string } {
  const require = createRequire(import.meta.url);
  const root = path.dirname(require.resolve("pdfjs-dist/package.json"));

  return {
    standardFontDataUrl: `${path.join(root, "standard_fonts")}${path.sep}`,
    cMapUrl: `${path.join(root, "cmaps")}${path.sep}`,
  };
}

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m1: readonly number[], m2: readonly number[]): Matrix {
  const [a1 = 1, b1 = 0, c1 = 0, d1 = 1, e1 = 0, f1 = 0] = m1;
  const [a2 = 1, b2 = 0, c2 = 0, d2 = 1, e2 = 0, f2 = 0] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function applyToBox(m: Matrix, x0: number, y0: number, x1: number, y1: number) {
  const points = [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ].map(([x = 0, y = 0]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] as const);

  return {
    x0: Math.min(...points.map((p) => p[0])),
    y0: Math.min(...points.map((p) => p[1])),
    x1: Math.max(...points.map((p) => p[0])),
    y1: Math.max(...points.map((p) => p[1])),
  };
}

/** Desenho maior que isto é moldura ou fundo de página, não conteúdo (TRI: 60%). */
const MAX_DRAWING_AREA = 0.6;
/** Distância, em pontos, para juntar traços vizinhos num desenho só. */
const DRAWING_MERGE_GAP = 2;

function mergeDrawings(drawings: Graphic[]): Graphic[] {
  const merged: Graphic[] = [];

  for (const drawing of drawings.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
    let target = drawing;
    for (let i = merged.length - 1; i >= 0; i--) {
      const other = merged[i];
      if (!other) continue;
      const touches =
        other.x0 <= target.x1 + DRAWING_MERGE_GAP &&
        target.x0 <= other.x1 + DRAWING_MERGE_GAP &&
        other.y0 <= target.y1 + DRAWING_MERGE_GAP &&
        target.y0 <= other.y1 + DRAWING_MERGE_GAP;
      if (!touches) continue;
      target = {
        kind: "drawing",
        x0: Math.min(other.x0, target.x0),
        y0: Math.min(other.y0, target.y0),
        x1: Math.max(other.x1, target.x1),
        y1: Math.max(other.y1, target.y1),
      };
      merged.splice(i, 1);
    }
    merged.push(target);
  }

  return merged;
}

export class PdfjsDocumentReader implements PdfDocumentOpener {
  async open(bytes: Uint8Array): Promise<OpenedPdf> {
    const pdfjs = await loadPdfJs();
    // Cópia: o pdf.js transfere o buffer para o worker e o deixa inutilizável para quem chamou.
    const data = new Uint8Array(bytes);
    const task = pdfjs.getDocument({
      data,
      ...assetDirs(),
      disableFontFace: true,
      useSystemFonts: false,
      verbosity: 0,
    });
    const doc = await task.promise;

    const readPage = async (pageNumber: number): Promise<RawPage> => {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const base = viewport.transform as Matrix;

      // A lista de operadores vem primeiro: é ela que carrega as fontes no `commonObjs`, de onde
      // sai o nome de verdade (`LMRoman10-Bold`) que a camada de texto não traz.
      const ops = await page.getOperatorList();
      const content = await page.getTextContent();

      const fontNames = new Map<string, string>();
      const fontNameOf = (id: string): string => {
        const known = fontNames.get(id);
        if (known !== undefined) return known;
        let name = id;
        try {
          const font = page.commonObjs.get(id) as { name?: unknown } | undefined;
          if (typeof font?.name === "string") name = font.name;
        } catch {
          // Fonte ainda não resolvida: o id interno serve para agrupar, só não diz o estilo.
        }
        fontNames.set(id, name);
        return name;
      };

      const spans: RawSpan[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const m = multiply(base, item.transform as number[]);
        const size = Math.hypot(m[2], m[3]);
        if (!Number.isFinite(size) || size <= 0) continue;

        spans.push({
          text: item.str,
          x0: m[4],
          x1: m[4] + item.width * viewport.scale,
          baseline: m[5],
          size,
          fontName: fontNameOf(item.fontName),
          endsLine: item.hasEOL,
        });
      }

      const graphics = collectGraphics(pdfjs, ops, base, viewport.width, viewport.height);
      page.cleanup();

      return { pageNumber, width: viewport.width, height: viewport.height, spans, graphics };
    };

    const renderRegion = async (
      pageNumber: number,
      box: NormalizedBox,
      dpi: number,
    ): Promise<Uint8Array> => {
      const page = await doc.getPage(pageNumber);
      const scale = dpi / 72;
      const full = page.getViewport({ scale });
      const x = Math.floor(box.x * full.width);
      const y = Math.floor(box.y * full.height);
      const w = Math.max(1, Math.ceil(box.width * full.width));
      const h = Math.max(1, Math.ceil(box.height * full.height));
      // O deslocamento põe o canto do trecho na origem do canvas: só o trecho é desenhado.
      const viewport = page.getViewport({ scale, offsetX: -x, offsetY: -y });

      const { createCanvas } = await import("@napi-rs/canvas");
      const canvas = createCanvas(w, h);
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, w, h);

      await page.render({
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise;
      page.cleanup();

      return new Uint8Array(await canvas.encode("png"));
    };

    return {
      pageCount: doc.numPages,
      readPage,
      renderRegion,
      close: () => task.destroy(),
    };
  }
}

function collectGraphics(
  pdfjs: PdfJs,
  ops: { fnArray: number[]; argsArray: unknown[] },
  base: Matrix,
  pageWidth: number,
  pageHeight: number,
): Graphic[] {
  const { OPS } = pdfjs;
  const images: Graphic[] = [];
  const drawings: Graphic[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = IDENTITY;
  const pageArea = pageWidth * pageHeight;

  const push = (kind: Graphic["kind"], x0: number, y0: number, x1: number, y1: number) => {
    if (![x0, y0, x1, y1].every(Number.isFinite)) return;
    const box = applyToBox(multiply(base, ctm), x0, y0, x1, y1);
    const clipped = {
      x0: Math.max(0, box.x0),
      y0: Math.max(0, box.y0),
      x1: Math.min(pageWidth, box.x1),
      y1: Math.min(pageHeight, box.y1),
    };
    if (clipped.x1 < clipped.x0 || clipped.y1 < clipped.y0) return;
    const area = (clipped.x1 - clipped.x0) * (clipped.y1 - clipped.y0);
    if (area > pageArea * MAX_DRAWING_AREA) return;
    (kind === "image" ? images : drawings).push({ kind, ...clipped });
  };

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = (ops.argsArray[i] ?? []) as unknown[];

    switch (fn) {
      case OPS.save:
        stack.push(ctm);
        break;
      case OPS.restore:
        ctm = stack.pop() ?? IDENTITY;
        break;
      case OPS.transform:
        ctm = multiply(ctm, args as number[]);
        break;
      case OPS.paintFormXObjectBegin: {
        stack.push(ctm);
        const matrix = args[0];
        if (Array.isArray(matrix) || ArrayBuffer.isView(matrix)) {
          ctm = multiply(ctm, Array.from(matrix as ArrayLike<number>));
        }
        break;
      }
      case OPS.paintFormXObjectEnd:
        ctm = stack.pop() ?? IDENTITY;
        break;
      case OPS.beginGroup: {
        stack.push(ctm);
        const group = args[0] as { matrix?: number[] } | undefined;
        if (group?.matrix) ctm = multiply(ctm, group.matrix);
        break;
      }
      case OPS.endGroup:
        ctm = stack.pop() ?? IDENTITY;
        break;
      case OPS.paintImageXObject:
      case OPS.paintInlineImageXObject:
      case OPS.paintImageMaskXObject:
      case OPS.paintImageXObjectRepeat:
      case OPS.paintImageMaskXObjectRepeat:
      case OPS.paintInlineImageXObjectGroup:
      case OPS.paintImageMaskXObjectGroup:
        push("image", 0, 0, 1, 1);
        break;
      case OPS.constructPath: {
        const minMax = args[2] as ArrayLike<number> | null | undefined;
        if (minMax && minMax.length >= 4) {
          push("drawing", minMax[0] ?? NaN, minMax[1] ?? NaN, minMax[2] ?? NaN, minMax[3] ?? NaN);
        }
        break;
      }
      default:
        break;
    }
  }

  return [...images, ...mergeDrawings(drawings)];
}

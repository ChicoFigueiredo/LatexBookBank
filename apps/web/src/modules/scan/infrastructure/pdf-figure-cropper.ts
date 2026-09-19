import "server-only";

import { PDFDocument } from "pdf-lib";

import type { NormalizedBox } from "@modules/assets/domain/source-anchor";
import type { FigureCropper, FigureFile } from "@modules/scan/application/figure-pass";

/**
 * O recorte da figura (D58, [ADR 0005](../../../../docs/adr/0005-figura-vetorial-quando-o-pdf-a-tem.md)).
 *
 * **Vetor**: `pdf-lib` copia a página do livro e aperta a caixa em volta da figura. Nada é
 * redesenhado — o arquivo que sai tem os mesmos traços, as mesmas fontes e as mesmas letras que
 * o livro tem, porque é o mesmo conteúdo. É a razão de existir a dependência: era a única coisa
 * que o projeto não sabia fazer.
 *
 * **Bitmap**: rasterizar na resolução em que a imagem está na página. Medir isso é possível —
 * a imagem embutida tem um tamanho em pixels e ocupa um tanto de pontos —, e é o que evita os
 * dois erros do DPI fixo: ampliar uma miniatura, ou gerar 40 MB de uma foto de meia página.
 *
 * **PNG de tela**: sempre, e pequeno. É o que a revisão mostra ao lado do item, e o que o preview
 * rápido usaria — nenhum dos dois quer abrir um PDF para ver uma miniatura.
 */

/** O PNG que a tela mostra. Suficiente para conferir a figura, leve para carregar em lista. */
const SCREEN_DPI = 150;
/** Teto do bitmap: acima disto o arquivo cresce mais do que a tela ou a impressão aproveitam. */
const MAX_RASTER_DPI = 600;

export interface CropperInput {
  /** O PDF inteiro, como está no storage. */
  readonly bytes: Uint8Array;
  /** O mesmo PDF já aberto pelo leitor do scan — é quem sabe rasterizar. */
  readonly render: (pageNumber: number, box: NormalizedBox, dpi: number) => Promise<Uint8Array>;
}

export class PdfFigureCropper implements FigureCropper {
  private document: PDFDocument | null = null;

  constructor(private readonly input: CropperInput) {}

  private async load(): Promise<PDFDocument> {
    // Uma vez só: carregar um PDF de 447 páginas por figura seria pagar o arquivo inteiro 107 vezes.
    this.document ??= await PDFDocument.load(this.input.bytes, { updateMetadata: false });
    return this.document;
  }

  async vector(pageNumber: number, box: NormalizedBox): Promise<Uint8Array> {
    const source = await this.load();
    const out = await PDFDocument.create();
    const [page] = await out.copyPages(source, [pageNumber - 1]);
    if (!page) throw new Error(`Página ${pageNumber} não existe no PDF fonte.`);

    /*
      A caixa vem em coordenadas de tela — origem no alto, y para baixo, de 0 a 1 — e o PDF conta
      de baixo para cima, em pontos, a partir da origem da sua própria MediaBox (que nem sempre é
      zero). As duas conversões moram aqui, e só aqui.
    */
    const media = page.getMediaBox();
    const x = media.x + box.x * media.width;
    const width = box.width * media.width;
    const height = box.height * media.height;
    const y = media.y + (1 - box.y - box.height) * media.height;

    page.setMediaBox(x, y, width, height);
    page.setCropBox(x, y, width, height);
    out.addPage(page);

    return await out.save({ useObjectStreams: false });
  }

  /**
   * O DPI em que a imagem está na página: quantos pixels ela tem dividido por quantas polegadas
   * ela ocupa. Rasterizar acima disso inventa pixels; abaixo, joga fora os que existem.
   */
  async raster(pageNumber: number, box: NormalizedBox, pixels: { width: number; height: number } | null): Promise<Uint8Array> {
    const source = await this.load();
    const page = source.getPage(pageNumber - 1);
    const inches = (box.width * page.getWidth()) / 72;
    const native = pixels && inches > 0 ? pixels.width / inches : SCREEN_DPI * 2;
    const dpi = Math.min(MAX_RASTER_DPI, Math.max(SCREEN_DPI, Math.round(native)));
    return await this.input.render(pageNumber, box, dpi);
  }

  async screen(pageNumber: number, box: NormalizedBox): Promise<Uint8Array> {
    return await this.input.render(pageNumber, box, SCREEN_DPI);
  }

  async crop(input: {
    readonly pageNumber: number;
    readonly box: NormalizedBox;
    readonly kind: "vector" | "raster" | "mixed";
    readonly pixels: { width: number; height: number } | null;
  }): Promise<FigureFile> {
    const screen = await this.screen(input.pageNumber, input.box);

    // Mista conta como vetor: o recorte em PDF leva o bitmap embutido junto, sem recompactar nada.
    if (input.kind === "raster") {
      return { content: await this.raster(input.pageNumber, input.box, input.pixels), mimeType: "image/png", screen };
    }
    return { content: await this.vector(input.pageNumber, input.box), mimeType: "application/pdf", screen };
  }
}

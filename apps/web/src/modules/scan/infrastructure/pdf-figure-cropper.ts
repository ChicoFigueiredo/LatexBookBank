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
 * **Bitmap**: rasterizado a 300 DPI. O ideal seria a resolução em que a imagem está na página,
 * mas isso exige o tamanho em pixels do objeto embutido, que o leitor ainda não entrega.
 *
 * **PNG de tela**: sempre, e pequeno. É o que a revisão mostra ao lado do item, e o que o preview
 * rápido usaria — nenhum dos dois quer abrir um PDF para ver uma miniatura.
 */

/** O PNG que a tela mostra. Suficiente para conferir a figura, leve para carregar em lista. */
const SCREEN_DPI = 150;
/**
 * O bitmap sai a 300 DPI.
 *
 * O ideal seria a resolução em que a imagem está na página — nem inventar pixel, nem jogar fora o
 * que existe —, e para isso é preciso o tamanho em pixels do objeto embutido, que o leitor ainda
 * não entrega: ele guarda a caixa do desenho, não os bytes da imagem. 300 DPI é o que imprime bem
 * sem gerar dezenas de megabytes, e a conta certa fica anotada como trabalho a fazer.
 */
const RASTER_DPI = 300;

/** Página girada: o recorte vetorial recusa, e quem chamou cai no PNG. */
export class RotatedPageError extends Error {
  constructor(pageNumber: number) {
    super(`A página ${pageNumber} está girada: o recorte vetorial não sabe desfazer isso.`);
    this.name = "RotatedPageError";
  }
}

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

  /**
   * Uma página girada não pode ser recortada por aqui.
   *
   * A caixa que chega foi medida pelo pdf.js, que entrega a página **já girada** — como o leitor
   * a vê. Girar de volta é conta de outro módulo, e uma conta errada aqui produz um arquivo
   * recortado num pedaço em branco da página, sem que nada avise: o PNG de tela, que passa pelo
   * pdf.js, sairia certo. Melhor recusar e cair no PNG.
   */
  private rotated(page: ReturnType<PDFDocument["getPage"]>): boolean {
    return (((page.getRotation().angle % 360) + 360) % 360) !== 0;
  }

  async vector(pageNumber: number, box: NormalizedBox): Promise<Uint8Array> {
    const source = await this.load();
    const out = await PDFDocument.create();
    const [page] = await out.copyPages(source, [pageNumber - 1]);
    if (!page) throw new Error(`Página ${pageNumber} não existe no PDF fonte.`);
    if (this.rotated(page)) throw new RotatedPageError(pageNumber);

    /*
      A caixa vem em coordenadas de tela — origem no alto, y para baixo, de 0 a 1 — e o PDF conta
      de baixo para cima, em pontos.

      A referência é a **CropBox**, e não a MediaBox: é ela que o pdf.js usa para montar a página
      que o scan mediu (`getViewport`). Num livro aparado nas margens — CropBox menor que a
      MediaBox — converter pela MediaBox põe o recorte dezenas de pontos fora do lugar, e o erro
      passa despercebido porque a miniatura, que vem do pdf.js, continua certa.
    */
    const crop = page.getCropBox();
    const x = crop.x + box.x * crop.width;
    const width = box.width * crop.width;
    const height = box.height * crop.height;
    const y = crop.y + (1 - box.y - box.height) * crop.height;

    page.setMediaBox(x, y, width, height);
    page.setCropBox(x, y, width, height);
    out.addPage(page);

    return await out.save({ useObjectStreams: false });
  }

  async raster(pageNumber: number, box: NormalizedBox): Promise<Uint8Array> {
    return await this.input.render(pageNumber, box, RASTER_DPI);
  }

  async screen(pageNumber: number, box: NormalizedBox): Promise<Uint8Array> {
    return await this.input.render(pageNumber, box, SCREEN_DPI);
  }

  async crop(input: {
    readonly pageNumber: number;
    readonly box: NormalizedBox;
    readonly kind: "vector" | "raster" | "mixed";
  }): Promise<FigureFile> {
    const screen = await this.screen(input.pageNumber, input.box);

    // Mista conta como vetor: o recorte em PDF leva o bitmap embutido junto, sem recompactar nada.
    if (input.kind !== "raster") {
      try {
        return { content: await this.vector(input.pageNumber, input.box), mimeType: "application/pdf", screen };
      } catch (error) {
        // Página girada: o PNG é a saída honesta. Perde-se o vetor, não se perde a figura.
        if (!(error instanceof RotatedPageError)) throw error;
      }
    }
    return { content: await this.raster(input.pageNumber, input.box), mimeType: "image/png", screen };
  }
}

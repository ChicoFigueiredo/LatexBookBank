import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import { PdfFigureCropper } from "@modules/scan/infrastructure/pdf-figure-cropper";
import { PdfjsDocumentReader } from "@modules/scan/infrastructure/pdfjs-document-reader";
import { buildLines } from "@modules/scan/domain/page";
import { buildProposal } from "@modules/scan/domain/structure";
import { captureProfile } from "@modules/scan/domain/profiles";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * O recorte da figura (D58, ADR 0005), contra o PDF de verdade.
 *
 * Vetorial é a promessa toda: o arquivo que sai tem de ser PDF, ter a página recortada no tamanho
 * da figura, e **conter os traços** — não uma imagem deles. É o que separa esta implementação de
 * rasterizar tudo, que era a alternativa rejeitada.
 */

async function figuraDaFixture() {
  const bytes = new Uint8Array(await readFile("tests/fixtures/scan/book-a.pdf"));
  const pdf = await new PdfjsDocumentReader().open(bytes);
  const pages = [];
  for (let page = 1; page <= pdf.pageCount; page++) pages.push(buildLines(await pdf.readPage(page)));
  const figura = buildProposal(pages, captureProfile("book-v1")!).items.find((item) => item.kind === "FIGURE");
  return { bytes, pdf, figura: figura!, region: figura!.regions[0]! };
}

describe("recortar a figura", () => {
  it("o recorte vetorial é um PDF de uma página, do tamanho da figura", async () => {
    const { bytes, pdf, region } = await figuraDaFixture();
    const cropper = new PdfFigureCropper({ bytes, render: (p, box, dpi) => pdf.renderRegion(p, box, dpi) });

    const recorte = await cropper.vector(region.pageNumber, region.box);
    const texto = Buffer.from(recorte).toString("latin1");

    expect(texto.startsWith("%PDF-")).toBe(true);
    expect((texto.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(1);

    // A página do recorte tem o tamanho da figura, não o da página inteira (595×842 pt no A4).
    const media = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(texto);
    expect(media).not.toBeNull();
    const largura = Number(media![3]) - Number(media![1]);
    const altura = Number(media![4]) - Number(media![2]);
    expect(largura).toBeGreaterThan(20);
    expect(largura).toBeLessThan(400);
    expect(altura).toBeGreaterThan(20);
    expect(altura).toBeLessThan(400);

    await pdf.close();
  });

  it("o recorte leva o desenho junto — é conteúdo, não retrato dele", async () => {
    const { bytes, pdf, region } = await figuraDaFixture();
    const cropper = new PdfFigureCropper({ bytes, render: (p, box, dpi) => pdf.renderRegion(p, box, dpi) });

    const recorte = await cropper.vector(region.pageNumber, region.box);
    // Relê o recorte com o mesmo leitor do scan: se os traços sobreviveram, ele os enxerga.
    const relido = await new PdfjsDocumentReader().open(recorte);
    const pagina = await relido.readPage(1);

    expect(pagina.graphics.some((graphic) => graphic.kind === "drawing")).toBe(true);
    // E o rótulo `P`, que está dentro do desenho, continua sendo texto no arquivo.
    expect(pagina.spans.map((span) => span.text).join("")).toContain("P");

    await relido.close();
    await pdf.close();
  });

  it("o par de arquivos: o vetorial para o LaTeX e o PNG para a tela", async () => {
    const { bytes, pdf, region } = await figuraDaFixture();
    const cropper = new PdfFigureCropper({ bytes, render: (p, box, dpi) => pdf.renderRegion(p, box, dpi) });

    const file = await cropper.crop({ pageNumber: region.pageNumber, box: region.box, kind: "vector" });

    expect(file.mimeType).toBe("application/pdf");
    expect(Buffer.from(file.content).toString("latin1").startsWith("%PDF-")).toBe(true);
    // PNG: os oito bytes da assinatura.
    expect([...file.screen.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);

    await pdf.close();
  });

  it("figura de bitmap sai em PNG, e não embrulhada num PDF", async () => {
    const { bytes, pdf, region } = await figuraDaFixture();
    const cropper = new PdfFigureCropper({ bytes, render: (p, box, dpi) => pdf.renderRegion(p, box, dpi) });

    const file = await cropper.crop({ pageNumber: region.pageNumber, box: region.box, kind: "raster" });

    expect(file.mimeType).toBe("image/png");
    expect([...file.content.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);

    await pdf.close();
  });
});

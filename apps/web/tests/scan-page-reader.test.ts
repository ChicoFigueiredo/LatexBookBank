import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { OpenedPdf } from "@modules/scan/application/pdf-document";
import { buildLines, type PageModel } from "@modules/scan/domain/page";
import { PdfjsDocumentReader } from "@modules/scan/infrastructure/pdfjs-document-reader";

// Lê PDF de verdade e, em alguns casos, monta um SQLite com as migrações: sozinho leva um ou dois
// segundos, e com a suíte inteira em paralelo passa dos 5 s padrão. Limite explícito, não sorte.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * A leitura de página no servidor (Fase 2 do prompt 03), contra os PDFs sintéticos da D48.
 */

const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(fileURLToPath(new URL(`./fixtures/scan/${name}`, import.meta.url))),
  );

const reader = new PdfjsDocumentReader();
const opened: OpenedPdf[] = [];

async function page(name: string, pageNumber: number): Promise<PageModel> {
  const pdf = await reader.open(fixture(name));
  opened.push(pdf);
  return buildLines(await pdf.readPage(pageNumber));
}

afterAll(async () => {
  await Promise.all(opened.map((pdf) => pdf.close()));
});

describe("linhas, fontes e corpo", () => {
  let enem: PageModel;
  beforeAll(async () => {
    enem = await page("enem-sintetico.pdf", 2);
  });

  it("o cabeçalho de questão é uma linha própria, em negrito, mesmo sem vão para a anterior", () => {
    const headers = enem.lines.filter((line) => /^QUESTÃO \d+$/.test(line.text));
    expect(headers.map((line) => line.text)).toEqual([
      "QUESTÃO 01",
      "QUESTÃO 02",
      "QUESTÃO 01",
      "QUESTÃO 02",
      "QUESTÃO 06",
      "QUESTÃO 136",
      "QUESTÃO 137",
      "QUESTÃO 138",
    ]);
    expect(headers.every((line) => line.bold)).toBe(true);
  });

  it("a alternativa é uma linha que começa pela letra", () => {
    const alternative = enem.lines.find((line) => line.text.startsWith("A primeira"));
    expect(alternative?.text).toBe("A primeira alternativa.");
    expect(alternative?.bold).toBe(false);
  });

  it("linhas de colunas diferentes na mesma altura não se misturam", () => {
    const middle = enem.width / 2;
    const crossing = enem.lines.filter((line) => line.x0 < middle - 20 && line.x1 > middle + 20);
    expect(crossing.map((line) => line.text)).toEqual([]);
    expect(enem.lines.filter((line) => line.x0 > middle).length).toBeGreaterThan(20);
  });

  it("o gráfico da questão 137 aparece como desenho", () => {
    const q137 = enem.lines.find((line) => line.text === "QUESTÃO 137");
    const drawings = enem.graphics.filter(
      (g) => g.kind === "drawing" && q137 && g.y0 > q137.y1 && g.y1 - g.y0 > 30,
    );
    expect(drawings.length).toBeGreaterThanOrEqual(1);
  });

  it("o título do capítulo tem corpo maior, e o texto não", async () => {
    const book = await page("book-a.pdf", 1);
    const chapter = book.lines.find((line) => line.text === "Capítulo 1");
    const body = book.lines.find((line) => line.text.startsWith("Uma função"));
    expect(chapter?.bold).toBe(true);
    expect(chapter?.size).toBeGreaterThan(18);
    expect(body?.size).toBeCloseTo(10.9, 0);
    expect(body?.bold).toBe(false);
  });

  it("a fórmula marca a linha como matemática, e o texto puro não", async () => {
    const formulas = await page("formulas.pdf", 1);
    const plain = formulas.lines.find((line) => line.text.startsWith("Texto simples"));
    const inline = formulas.lines.find((line) => line.text.startsWith("A fórmula inline"));
    expect(plain?.mathRatio).toBe(0);
    expect(inline?.mathRatio).toBeGreaterThan(0.15);
    // O expoente fica na linha dele, não vira linha própria.
    expect(inline?.text).toContain("x2 + y2 = r2");
  });
});

describe("renderizar um trecho", () => {
  it("devolve um PNG do tamanho pedido", async () => {
    const pdf = await reader.open(fixture("formulas.pdf"));
    opened.push(pdf);
    const png = await pdf.renderRegion(1, { x: 0.1, y: 0.1, width: 0.5, height: 0.1 }, 72);

    expect([...png.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const view = new DataView(png.buffer, png.byteOffset);
    expect(view.getUint32(16)).toBe(Math.ceil(0.5 * 595.276));
  });
});

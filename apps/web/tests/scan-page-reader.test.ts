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
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./fixtures/scan/${name}`, import.meta.url))));

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

/**
 * O "<" que a fonte do *Fundamentos* entrega como NUL (vol. 1, p. 272: "g(x) < 0" sai como
 * "g(x) \0 0"). O banco corta o texto no NUL, e o item da p. 272 guardava só até "g(x) ": a letra
 * da resposta, o texto do item sem reconhecimento e a conferência liam metade.
 */
describe("o caractere NUL da fonte", () => {
  it("vira o símbolo ilegível da área privada, e o resto da linha fica", () => {
    const page = buildLines({
      pageNumber: 1,
      width: 595,
      height: 842,
      spans: [
        {
          text: "g(x) \u0000 0 e f(x) \u0004 0",
          x0: 50,
          x1: 200,
          baseline: 100,
          size: 10,
          fontName: "Times-Roman",
          endsLine: true,
        },
      ],
      graphics: [],
    });
    const text = page.lines[0]?.text ?? "";
    expect(text).not.toContain("\u0000");
    expect(text).toBe("g(x)  0 e f(x) \u0004 0");
  });
});

/**
 * A fonte de símbolos que entrega o glifo com o código de um dígito: no vol. 7 do Fundamentos, a
 * MathematicalPi-One dava "=" como "5", "−" como "2" e "+" como "1" — "P(t) = 2(1 − t) + 8t" saía
 * "P(t) 5 2(1 2 t) 1 8t". O texto parecia legível, o item não ia ao modelo, e ia ao acervo assim.
 */
describe("a fonte MathematicalPi", () => {
  const span = (text: string, fontName: string, x0: number) => ({
    text,
    x0,
    x1: x0 + 6,
    baseline: 100,
    size: 9,
    fontName,
    endsLine: false,
  });

  it("o que ela entrega como letra ou dígito é símbolo ilegível; o resto da linha fica", () => {
    const page = buildLines({
      pageNumber: 1,
      width: 595,
      height: 842,
      spans: [
        span("P(t)", "VISXLK+FranklinGothic-Book", 50),
        span("5", "WISXLK+MathematicalPi-One", 60),
        { ...span("2(1", "VISXLK+FranklinGothic-Book", 70), endsLine: true },
      ],
      graphics: [],
    });
    expect(page.lines[0]?.text).toBe("P(t)  2(1");
  });

  it("o símbolo que ela já entrega em Unicode fica, e a fonte Symbol não é tocada", () => {
    const page = buildLines({
      pageNumber: 1,
      width: 595,
      height: 842,
      spans: [
        span("x", "Times-Roman", 50),
        span("∈", "WISXLK+MathematicalPi-One", 60),
        span("(", "Symbol", 70),
        { ...span("A", "Times-Roman", 80), endsLine: true },
      ],
      graphics: [],
    });
    expect(page.lines[0]?.text.replace(/\s/g, "")).toBe("x∈(A");
  });
});

/**
 * O expoente e a fração em fonte comum: no gabarito do vol. 5 do Fundamentos, "a) 5¹⁰ b) 6⁸" e
 * "7/22" vêm em corpo menor e fora da linha, mas na fonte do texto. A camada de texto dava "510" e
 * "227", a linha parecia texto, e a resposta ia ao acervo assim, sem passar pelo modelo.
 */
describe("o expoente e a fração em fonte comum", () => {
  const span = (text: string, x0: number, baseline: number, size: number, endsLine = false) => ({
    text,
    x0,
    x1: x0 + text.length * size * 0.5,
    baseline,
    size,
    fontName: "VISXLK+FranklinGothic-Book",
    endsLine,
  });

  it("o trecho menor e fora da linha conta como matemática", () => {
    const page = buildLines({
      pageNumber: 1,
      width: 595,
      height: 842,
      spans: [
        span("285.", 50, 100, 9),
        span("a)", 70, 100, 9),
        span("5", 82, 100, 9),
        span("10", 87, 96, 6),
        span("b)", 110, 100, 9),
        span("6", 122, 100, 9),
        span("8", 127, 96, 6, true),
      ],
      graphics: [],
    });
    expect(page.lines[0]?.mathRatio).toBeGreaterThan(0.2);
  });

  it("a linha de texto do mesmo corpo não", () => {
    const page = buildLines({
      pageNumber: 1,
      width: 595,
      height: 842,
      spans: [span("Quantos planos os pontos determinam?", 50, 100, 9, true)],
      graphics: [],
    });
    expect(page.lines[0]?.mathRatio).toBe(0);
  });
});

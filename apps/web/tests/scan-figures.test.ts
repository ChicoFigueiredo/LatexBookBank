import { describe, expect, it } from "vitest";

import { findFigures, type FigureInput } from "@modules/scan/domain/figures";

/**
 * Achar a figura numa página (D58, ADR 0005).
 *
 * Um diagrama não é um objeto no PDF: são dezenas de traços soltos, e por cima deles letras que
 * são texto de verdade. O que se afirma aqui é o que a tela e o LaTeX dependem: os traços viram
 * **uma** figura, as letras de dentro vão junto (e somem do fluxo), e a legenda do livro é
 * reconhecida sem entrar na imagem.
 */

const line = (id: string, text: string, box: [number, number, number, number], mathRatio = 0) => ({
  id,
  pageNumber: 1,
  slot: 0,
  text,
  x0: box[0],
  y0: box[1],
  x1: box[2],
  y1: box[3],
  mathRatio,
});

const drawing = (box: [number, number, number, number], kind: "drawing" | "image" = "drawing") => ({
  pageNumber: 1,
  slot: 0,
  kind,
  x0: box[0],
  y0: box[1],
  x1: box[2],
  y1: box[3],
});

const input = (over: Partial<FigureInput> = {}): FigureInput => ({
  graphics: [],
  lines: [],
  bodySize: 10,
  lineSpacing: 13,
  ...over,
});

describe("achar figuras", () => {
  it("junta os traços vizinhos numa figura só", () => {
    // Um diagrama de Venn: dois círculos e o retângulo do universo, desenhados em traços separados.
    const figuras = findFigures(
      input({
        graphics: [drawing([100, 200, 160, 260]), drawing([140, 205, 200, 265]), drawing([90, 195, 210, 270])],
      }),
    );

    expect(figuras).toHaveLength(1);
    expect(figuras[0]?.box).toMatchObject({ x0: 90, y0: 195, x1: 210, y1: 270 });
    expect(figuras[0]?.kind).toBe("vector");
  });

  it("não junta dois desenhos distantes — são duas figuras", () => {
    const figuras = findFigures(
      input({ graphics: [drawing([100, 100, 200, 180]), drawing([100, 400, 200, 480])] }),
    );
    expect(figuras).toHaveLength(2);
  });

  it("descarta fio decorativo: fino e sozinho não é figura", () => {
    // A régua que separa o rodapé tem 300 pt de largura e 1 de altura.
    expect(findFigures(input({ graphics: [drawing([70, 700, 370, 701])] }))).toEqual([]);
  });

  it("absorve o texto de dentro da caixa, e só o de dentro", () => {
    const dentro = line("l1", "A", [120, 210, 128, 220]);
    const tambemDentro = line("l2", "B", [170, 215, 178, 225]);
    const fora = line("l3", "Considere os conjuntos A e B.", [70, 300, 400, 312]);

    const figuras = findFigures(
      input({ graphics: [drawing([100, 200, 200, 260])], lines: [dentro, tambemDentro, fora] }),
    );

    expect(figuras[0]?.absorbedLineIds).toEqual(["l1", "l2"]);
    expect(figuras[0]?.captionLineIds).toEqual([]);
  });

  it("reconhece a legenda embaixo da figura, e a mantém fora da imagem", () => {
    const legenda = line("cap", "Figura 2.3 — Diagrama de Venn de A ∪ B", [100, 266, 300, 278]);
    const figuras = findFigures(input({ graphics: [drawing([100, 200, 200, 260])], lines: [legenda] }));

    expect(figuras[0]?.caption).toBe("Diagrama de Venn de A ∪ B");
    expect(figuras[0]?.label).toBe("Figura 2.3");
    expect(figuras[0]?.captionLineIds).toEqual(["cap"]);
    // A legenda não entra na imagem: ela vira `\caption`, que o LaTeX numera de novo.
    expect(figuras[0]?.box.y1).toBe(260);
  });

  it("não confunde o parágrafo seguinte com legenda", () => {
    const paragrafo = line("p", "Logo, todo elemento de A pertence a B, como se queria.", [70, 266, 400, 278]);
    const figuras = findFigures(input({ graphics: [drawing([100, 200, 200, 260])], lines: [paragrafo] }));

    expect(figuras[0]?.caption).toBeNull();
    expect(figuras[0]?.captionLineIds).toEqual([]);
    expect(figuras[0]?.absorbedLineIds).toEqual([]);
  });

  it("legenda longe demais não é legenda", () => {
    const solta = line("x", "Figura 9 — de outra página", [100, 500, 300, 512]);
    const figuras = findFigures(input({ graphics: [drawing([100, 200, 200, 260])], lines: [solta] }));
    expect(figuras[0]?.caption).toBeNull();
  });

  it("moldura em volta de texto não é figura", () => {
    // O *Fundamentos de Matemática Elementar* emoldura definições e fórmulas com um retângulo, e
    // a moldura é um traço como qualquer outro. Sem esta regra, metade do livro virava imagem.
    const moldura = drawing([70, 200, 440, 280]);
    const texto = [
      line("t1", "Dados dois conjuntos A e B, chama-se diferença", [76, 210, 430, 222]),
      line("t2", "entre A e B o conjunto dos elementos de A que", [76, 228, 430, 240]),
      line("t3", "não pertencem a B.", [76, 246, 300, 258]),
    ];
    expect(findFigures(input({ graphics: [moldura], lines: texto }))).toEqual([]);
  });

  it("a tarja de título também é moldura, mesmo com uma linha só", () => {
    // "E X E R C Í C I O S" numa tarja larga e baixa: pouca linha, muita tinta.
    const tarja = drawing([70, 100, 440, 143]);
    const titulo = line("t", "E X E R C Í C I O S", [80, 108, 430, 132]);
    expect(findFigures(input({ graphics: [tarja], lines: [titulo] }))).toEqual([]);
  });

  it("mas o diagrama com rótulos continua sendo figura", () => {
    // A diferença é a densidade: muitos traços, e dentro deles só rótulos curtos.
    const diagrama = [drawing([100, 200, 200, 280]), drawing([150, 210, 250, 290]), drawing([90, 195, 260, 300])];
    const rotulos = [line("a", "A", [120, 230, 128, 242]), line("b", "B", [210, 240, 218, 252])];
    const figuras = findFigures(input({ graphics: diagrama, lines: rotulos }));
    expect(figuras).toHaveLength(1);
    expect(figuras[0]?.absorbedLineIds).toEqual(["a", "b"]);
  });

  it("frase longa dentro da caixa não é rótulo: fica no texto do livro", () => {
    const diagrama = [drawing([100, 200, 400, 300]), drawing([110, 210, 390, 290]), drawing([120, 220, 380, 280])];
    const frase = line("f", "Na figura acima, os conjuntos A e B são disjuntos.", [130, 240, 370, 252]);
    const figuras = findFigures(input({ graphics: diagrama, lines: [frase] }));
    expect(figuras[0]?.absorbedLineIds).toEqual([]);
  });

  it("imagem embutida é figura, mesmo sozinha, e sai marcada como bitmap", () => {
    const figuras = findFigures(input({ graphics: [drawing([100, 200, 300, 400], "image")] }));
    expect(figuras[0]?.kind).toBe("raster");
  });

  it("traço e imagem juntos saem como mista — o formato do arquivo depende disso", () => {
    const figuras = findFigures(
      input({ graphics: [drawing([100, 200, 200, 260]), drawing([110, 210, 190, 250], "image")] }),
    );
    expect(figuras[0]?.kind).toBe("mixed");
  });

  it("a caixa sobra um pouco além do traço, ou o recorte come a borda", () => {
    const [figura] = findFigures(input({ graphics: [drawing([100, 200, 200, 260])], bodySize: 10 }));
    expect(figura?.crop.x0).toBeLessThan(100);
    expect(figura?.crop.y1).toBeGreaterThan(260);
  });
});

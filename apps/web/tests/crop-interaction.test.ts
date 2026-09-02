import { describe, expect, it } from "vitest";

import {
  clampToPage,
  CURSORS,
  ESCALA_MAXIMA,
  ESCALA_MINIMA,
  escalaParaCaber,
  handleAt,
  HANDLES,
  isUsable,
  MIN_SIZE_PX,
  rectFromDrag,
  resize,
} from "@modules/assets/domain/crop-interaction";

/**
 * As regras do recorte, fora do `onMouseMove`.
 *
 * Arrastar, redimensionar e prender à página são **regras** — e regra dentro de um handler de
 * evento é regra que ninguém testa. O que fica no componente é o canvas e o `pdf.js`, que só a
 * conferência visual resolve.
 */

const page = { width: 800, height: 1000 };
const rect = { x: 100, y: 200, width: 300, height: 150 };

describe("desenhar", () => {
  it("arrastar da direita para a esquerda dá o mesmo retângulo", () => {
    // É tão natural quanto o contrário, e largura negativa quebraria tudo daqui para a frente.
    const a = rectFromDrag({ x: 100, y: 200 }, { x: 400, y: 350 }, page);
    const b = rectFromDrag({ x: 400, y: 350 }, { x: 100, y: 200 }, page);

    expect(a).toEqual(b);
    expect(a).toEqual(rect);
  });

  it("o mouse fora da página não gera coordenada negativa", () => {
    // Acontece o tempo todo ao arrastar rápido ou até a borda.
    const drawn = rectFromDrag({ x: 50, y: 50 }, { x: -200, y: -300 }, page);

    expect(drawn.x).toBe(0);
    expect(drawn.y).toBe(0);
  });

  it("o retângulo nunca passa da borda", () => {
    const drawn = rectFromDrag({ x: 700, y: 900 }, { x: 2000, y: 3000 }, page);

    expect(drawn.x + drawn.width).toBeLessThanOrEqual(page.width);
    expect(drawn.y + drawn.height).toBeLessThanOrEqual(page.height);
  });

  it("desenho pequeno demais é clique, não recorte", () => {
    // Um retângulo de dois pixels na tela seria impossível de pegar de volta para ajustar.
    expect(isUsable({ x: 0, y: 0, width: MIN_SIZE_PX - 1, height: 100 })).toBe(false);
    expect(isUsable({ x: 0, y: 0, width: MIN_SIZE_PX, height: MIN_SIZE_PX })).toBe(true);
  });
});

describe("qual alça está sob o ponto", () => {
  it("acha as quatro quinas", () => {
    expect(handleAt({ x: 100, y: 200 }, rect)).toBe("nw");
    expect(handleAt({ x: 400, y: 200 }, rect)).toBe("ne");
    expect(handleAt({ x: 400, y: 350 }, rect)).toBe("se");
    expect(handleAt({ x: 100, y: 350 }, rect)).toBe("sw");
  });

  it("acha os quatro lados", () => {
    expect(handleAt({ x: 250, y: 200 }, rect)).toBe("n");
    expect(handleAt({ x: 400, y: 275 }, rect)).toBe("e");
    expect(handleAt({ x: 250, y: 350 }, rect)).toBe("s");
    expect(handleAt({ x: 100, y: 275 }, rect)).toBe("w");
  });

  it("a quina ganha do lado quando as duas alcançam", () => {
    // Elas se sobrepõem nos cantos, e quem mira um canto quer redimensionar nas duas direções —
    // acertar o lado ali seria sempre frustrante.
    const small = { x: 0, y: 0, width: 20, height: 20 };
    expect(handleAt({ x: 0, y: 0 }, small)).toBe("nw");
  });

  it("dentro do retângulo é `move`; fora é nada", () => {
    expect(handleAt({ x: 250, y: 275 }, rect)).toBe("move");
    expect(handleAt({ x: 700, y: 900 }, rect)).toBeNull();
  });

  it("toda alça tem cursor declarado", () => {
    // Sai do domínio para a tela não decidir por conta própria.
    for (const handle of HANDLES) expect(CURSORS[handle]).toBeTruthy();
  });
});

describe("redimensionar", () => {
  it("a alça sudeste cresce para baixo e para a direita", () => {
    const resized = resize(rect, "se", { x: 50, y: 30 }, page);

    expect(resized).toEqual({ x: 100, y: 200, width: 350, height: 180 });
  });

  it("a alça noroeste move a origem e encolhe", () => {
    const resized = resize(rect, "nw", { x: 20, y: 10 }, page);

    expect(resized).toEqual({ x: 120, y: 210, width: 280, height: 140 });
  });

  it("um lado só mexe num eixo", () => {
    expect(resize(rect, "n", { x: 999, y: 50 }, page)).toEqual({
      x: 100,
      y: 250,
      width: 300,
      height: 100,
    });
  });

  it("puxar além do lado oposto **vira o retângulo do avesso**, em vez de travar", () => {
    // É o comportamento que as pessoas esperam de qualquer ferramenta de seleção.
    const flipped = resize(rect, "w", { x: 400, y: 0 }, page);

    expect(flipped.x).toBe(400);
    expect(flipped.width).toBe(100);
  });

  it("`move` desloca sem mudar o tamanho", () => {
    const moved = resize(rect, "move", { x: 30, y: -50 }, page);

    expect(moved).toEqual({ x: 130, y: 150, width: 300, height: 150 });
  });

  it("mover para fora prende na borda, e o tamanho encolhe em vez de vazar", () => {
    const moved = resize(rect, "move", { x: 10_000, y: 10_000 }, page);

    expect(moved.x + moved.width).toBeLessThanOrEqual(page.width);
    expect(moved.y + moved.height).toBeLessThanOrEqual(page.height);
  });
});

describe("prender à página", () => {
  it("origem negativa vira zero", () => {
    expect(clampToPage({ x: -10, y: -20, width: 50, height: 50 }, page)).toEqual({
      x: 0,
      y: 0,
      width: 50,
      height: 50,
    });
  });

  it("tamanho que ultrapassa é cortado, não deslocado", () => {
    // Deslocar mudaria o que a pessoa desenhou; cortar respeita a borda e o começo.
    const clamped = clampToPage({ x: 700, y: 0, width: 300, height: 10 }, page);

    expect(clamped.x).toBe(700);
    expect(clamped.width).toBe(100);
  });
});

/**
 * A escala que enquadra a página.
 *
 * Nasceu do dogfooding da prova ProfMat (2026-09-02): com zoom só em passos de 20%, achar o
 * enquadramento certo era adivinhar quantos cliques faltavam, e cada palpite custava um render.
 */
describe("escalaParaCaber", () => {
  /** Página A4 retrato em 72 dpi — a forma real do PDF da prova. */
  const A4 = { width: 595, height: 842 };

  it("por largura, enche o palco descontando a folga", () => {
    // (1000 - 32) / 595 — cabe na largura, e a altura que sobra vira rolagem, que é o desejado
    // quando se está lendo e recortando.
    expect(escalaParaCaber(A4, { width: 1000, height: 600 }, "largura")).toBeCloseTo(
      (1000 - 32) / A4.width,
      5,
    );
  });

  it("página inteira obedece à dimensão mais apertada", () => {
    // O palco é largo e baixo: quem manda é a altura, senão a página passaria do rodapé.
    const escala = escalaParaCaber(A4, { width: 1000, height: 600 }, "pagina");
    expect(escala).toBeCloseTo((600 - 32) / 842, 3);
    expect(escala! * A4.height).toBeLessThanOrEqual(600);
  });

  it("respeita o teto e o piso do zoom da barra", () => {
    // Palco gigante pediria 8×; o visualizador não passa de 4× — o mesmo limite dos botões.
    expect(escalaParaCaber(A4, { width: 5000, height: 9000 }, "largura")).toBe(ESCALA_MAXIMA);
    // Palco minúsculo pediria menos de 40%, onde a página deixa de ser legível.
    expect(escalaParaCaber(A4, { width: 100, height: 100 }, "pagina")).toBe(ESCALA_MINIMA);
  });

  it("devolve null quando não há o que medir", () => {
    // Antes do primeiro render a página não tem tamanho, e o palco pode estar oculto. Inventar uma
    // escala aqui moveria o zoom para um lugar que ninguém pediu.
    expect(escalaParaCaber({ width: 0, height: 0 }, { width: 800, height: 600 }, "largura")).toBeNull();
    expect(escalaParaCaber(A4, { width: 0, height: 0 }, "largura")).toBeNull();
  });
});

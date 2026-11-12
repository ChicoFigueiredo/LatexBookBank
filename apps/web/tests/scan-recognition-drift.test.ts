import { describe, expect, it } from "vitest";

import { chunkAgrees, keepsModel, recognitionDrift, withoutInventedTail } from "@modules/scan/domain/recognition-drift";

/**
 * A conferência do reconhecimento contra a camada de texto do PDF (D78).
 *
 * O modelo lê o símbolo que a camada não lê; a camada lê cada dígito e cada palavra que o modelo
 * troca ou inventa. Os casos são do *Fundamentos* vol. 1.
 */

describe("o pedaço concorda com a camada de texto?", () => {
  it("concorda quando diz o mesmo, com o símbolo que a camada perdia", () => {
    const camada = "Se A não é igual a B, escrevemos A \uE0DE B. É evidente que A é diferente de B";
    expect(chunkAgrees(camada, "Se $A$ não é igual a $B$, escrevemos $A \\neq B$. É evidente que $A$ é diferente de $B$")).toBe(true);
  });

  it("não concorda quando o modelo inventa número", () => {
    expect(chunkAgrees("Sejam x = 12 e y = 15; calcule a soma de x com y.", "Sejam $x = 78$ e $y = 96$; calcule a soma de $x$ com $y$.")).toBe(false);
  });

  it("o nome do ambiente não é palavra: o sistema em cases concorda (exercício 174)", () => {
    // Seis "cases" contavam como palavra a mais, e o sistema do modelo virava "5xx  yy  15".
    const letras = ["a", "d", "b", "e", "c", "f"];
    const camada = ["174. Resolva analítica e graficamente os sistemas de equações.", ...letras.map((l) => `${l}) 5xx \u0001 yy \u0002\u0002 15`)].join("\n");
    const sistemas = letras.map((l) => `${l}) $\\begin{cases} x + y = 5 \\\\ x - y = 1 \\end{cases}$`).join(" ");
    expect(chunkAgrees(camada, `174. Resolva analítica e graficamente os sistemas de equações. ${sistemas}`)).toBe(true);
  });

  it("o nome do operador não é palavra: o limite concorda, com o x colado no lim (vol. 8, exercício 96)", () => {
    // A camada lê "xlim" e "lim" — o "x" de baixo colado no operador —, e o \\lim do modelo não
    // vira texto: quatro das cinco palavras "faltavam", e a leitura certa ia embora pela camada.
    const camada =
      "96. Calcule:\na) xlim➞ 3 22x2 \u0001 3x  1\nc) xlim➞ 0 e x \u0001 1\n3x  2\nb) x ➞lim\u00012 3x2  6x  2\nd) x ➞lim\u00012 10\n4x2  6x \u0001 2\n3x  4";
    const modelo =
      "96. Calcule:\n\na) $\\lim_{x \\to 3} 2x^2 - 3x + 1$\n\nb) $\\lim_{x \\to -2} 3x^2 + 6x + 2$\n\nc) $\\lim_{x \\to 0} \\frac{3x + 2}{x - 1}$\n\nd) $\\lim_{x \\to -2} \\frac{4x^2 + 6x - 2}{3x + 4}$";
    expect(chunkAgrees(camada, modelo)).toBe(true);
  });

  it("não concorda quando o modelo escreve outra página (p. 46)", () => {
    const camada = "A natureza do infinito é uma questão antiga e controversa. Arquimedes já fazia distinção entre infinito potencial e infinito atual.";
    expect(chunkAgrees(camada, "Aplicações da Integral Definida: o cálculo de áreas entre curvas e o volume de sólidos de revolução.")).toBe(false);
  });

  it("não concorda quando a camada só tem rótulos e o modelo escreve uma frase inteira (exercício 142)", () => {
    // Entre os diagramas, a camada só tem "a) c) A B A B"; o modelo inventou a área do trapézio.
    const invencao = "A área do trapézio é dada por $A = \\frac{B + b}{2} h$, onde $B$ é a base maior, $b$ é a base menor e $h$ é a altura.";
    expect(chunkAgrees("a)\nc)\nA\nB\nA\nB", invencao)).toBe(false);
    // Os rótulos lidos de volta, com o símbolo, continuam concordando.
    expect(chunkAgrees("a)\nc)\nA\nB\nA\nB", "a) c) A B A B")).toBe(true);
  });
});

describe("quando não concorda, fica o modelo ou a camada?", () => {
  it("fica a camada quando ela é legível e o modelo inventou número", () => {
    expect(keepsModel("Sejam x = 12 e y = 15; calcule a soma de x com y.", "Sejam $x = 78$ e $y = 96$; calcule a soma de $x$ com $y$.")).toBe(false);
  });

  it("fica o modelo quando a camada tem buraco no lugar do número e as palavras batem", () => {
    // A fração que a fonte desenha: a camada fica com os buracos, o modelo com os dígitos.
    const camada = "Calcule o valor da expressão \uF8FF\uF8FF\uF8FF para os valores dados no enunciado.";
    const modelo = "Calcule o valor da expressão $\\frac{125}{5}$ para os valores dados no enunciado.";
    expect(chunkAgrees(camada, modelo)).toBe(false);
    expect(keepsModel(camada, modelo)).toBe(true);
  });

  it("fica a camada quando as palavras não batem, mesmo com buraco (a invenção não passa)", () => {
    const camada = "Dados os conjuntos A \uE035 {1, 2, 3} e B \uE035 {2, 3, 4}, determine a reunião e a intersecção deles.";
    expect(keepsModel(camada, "Calcule a área do círculo de raio 3 e o perímetro do quadrado de lado 4, em centímetros.")).toBe(false);
  });
});

describe("o diagnóstico de números", () => {
  it("dígito a dígito: o expoente colado na camada não é divergência", () => {
    expect(recognitionDrift("22 = 4", "$2^{2} = 4$")).toBeNull();
  });
});

describe("o modelo que resolve o exercício em vez de transcrevê-lo (vol. 1, exercícios 181 a 184)", () => {
  const camada = "181. Obtenha a equação da reta que passa pelo ponto (\uE0322, 4) e tem coeficiente\nangular igual a \uE0323.";
  const enunciado = "181. Obtenha a equação da reta que passa pelo ponto $(-2, 4)$ e tem coeficiente angular igual a $-3$.";

  it("a resolução que o livro não tem sai, e o enunciado lido fica", () => {
    const resolvido = `${enunciado}\n\n$y - y_1 = m(x - x_1)$\n\n$y - 4 = -3(x - (-2))$\n\n$y - 4 = -3x - 6$\n\n$y = -3x - 2$`;
    expect(withoutInventedTail(camada, resolvido)).toBe(enunciado);
    expect(chunkAgrees(camada, withoutInventedTail(camada, resolvido))).toBe(true);
  });

  it("e a resolução errada também (exercício 183)", () => {
    const camada183 = "183. Obtenha a equação da reta que passa pelo ponto (\uE0322, 1) e tem coeficiente\nlinear igual a 4.";
    const lido = "183. Obtenha a equação da reta que passa pelo ponto $(-2, 1)$ e tem coeficiente linear igual a 4.";
    expect(withoutInventedTail(camada183, `${lido}\n\n$y = 4x + b$\n$1 = 4(-2) + b$\n$b = 9$\n$y = 4x + 9$`)).toBe(lido);
  });

  it("a conta que o livro imprime fica: a camada tem as linhas dela, mesmo sem palavra", () => {
    const sistema = "Resolva o sistema de equações abaixo pelo método da adição:\nx \uF8FF y \uF8FF 5\nx \uF8FF y \uF8FF 1";
    const lido = "Resolva o sistema de equações abaixo pelo método da adição:\n$x + y = 5$\n$x - y = 1$";
    expect(withoutInventedTail(sistema, lido)).toBe(lido);
  });

  it("não corta quando o que sobra perde os números do livro (vol. 3, exercício 418)", () => {
    // O modelo inventou quatro equações e depois transcreveu as quatro de verdade.
    const camada418 = "418. Resolva, em I = [0, 2\u03C0], as seguintes equações:\na) 2 sen2 x \uF8FF 3 cos x \uF8FF 3 \uF8FF 0  c) 5 cos x \uF8FF 3 \uF8FF \uF8FF2 cos2 x\nb) 2 cos x \uF8FF 1 \uF8FF cos2 x  d) 4 cos x (cos x \uF8FF 2) \uF8FF \uF8FF3";
    const lido =
      "418. Resolva, em $I = [0, 2\\pi]$, as seguintes equações:\n\na) $2\\cos x + 1 = 0$\nb) $\\tan x = 1$\nc) $4\\cos^2 x - 3 = 0$\nd) $2\\sin^2 x + 2\\cos x - 3 = 0$\na) $2 \\sen^2 x - 3 \\cos x - 3 = 0$ c) $5 \\cos x - 3 = -2\\cos^2 x$\nb) $2\\cos x = 1 + \\cos^2 x$ d) $4 \\cos x(\\cos x - 2) = -3$";
    expect(withoutInventedTail(camada418, lido)).toBe(lido);
  });

  it("o que segue com palavra do livro não é cauda inventada", () => {
    const camada2 = "Calcule o valor de x na equação dada.\nEm seguida, verifique a resposta encontrada.";
    const lido = "Calcule o valor de $x$ na equação dada.\n$2x + 3 = 11$\nEm seguida, verifique a resposta encontrada.";
    expect(withoutInventedTail(camada2, lido)).toBe(lido);
  });
});

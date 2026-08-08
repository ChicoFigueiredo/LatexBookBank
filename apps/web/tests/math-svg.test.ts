import { describe, expect, it } from "vitest";

import { parseMathSvg } from "@modules/preview/domain/math-svg";
import { maskUrlFor } from "@shared/css-mask";
import { renderMath } from "@modules/preview/infrastructure/mathjax";

/**
 * O MathJax roda aqui de verdade.
 *
 * Isso só é possível porque a integração usa `liteAdaptor`, que não precisa de DOM — a mesma
 * escolha que faz o motor rodar no navegador, no Node e neste teste sem mudar uma linha.
 */

describe("parseMathSvg", () => {
  const output =
    '<mjx-container class="MathJax" jax="SVG" display="true">' +
    '<svg style="vertical-align: -2.063ex;" xmlns="http://www.w3.org/2000/svg" ' +
    'width="15.893ex" height="5.59ex" viewBox="0 -1559 7024.6 2470.9"><g/></svg>' +
    "</mjx-container>";

  it("descarta o `<mjx-container>` e fica com o `<svg>`", () => {
    expect(parseMathSvg(output)?.svg.startsWith("<svg")).toBe(true);
    expect(parseMathSvg(output)?.svg).not.toContain("mjx-container");
  });

  it("lê largura e altura em `ex` — a unidade que acompanha o texto ao redor", () => {
    expect(parseMathSvg(output)).toMatchObject({ widthEx: 15.893, heightEx: 5.59 });
  });

  it("guarda a profundidade com o sinal invertido, como a tipografia a chama", () => {
    // O CSS diz "desce -2.063ex"; o componente pensa em "profundidade 2.063".
    expect(parseMathSvg(output)?.verticalAlignEx).toBe(2.063);
  });

  it("devolve `null` quando não há `<svg>`", () => {
    // Melhor mostrar o LaTeX cru do que um retângulo vazio que ninguém sabe explicar.
    expect(parseMathSvg("<mjx-container>?</mjx-container>")).toBeNull();
  });
});

describe("maskUrlFor", () => {
  it("escapa o SVG para caber numa URI de dado", () => {
    const url = maskUrlFor('<svg viewBox="0 0 1 1"/>');

    expect(url.startsWith('url("data:image/svg+xml,')).toBe(true);
    expect(url).toContain("%3Csvg");
  });
});

describe("renderMath", () => {
  it("converte LaTeX em SVG autocontido", () => {
    const result = renderMath("x^2", false);

    expect(result?.svg.startsWith("<svg")).toBe(true);
    expect(result?.widthEx).toBeGreaterThan(0);
  });

  it("não emite `<use>` apontando para fora do arquivo", () => {
    // `fontCache: "none"` é o que garante isso, e é o que a máscara CSS exige: uma máscara só
    // enxerga o próprio arquivo, e uma referência externa desenharia o nada.
    const result = renderMath("\\int_0^1 f(t)\\,dt", true);

    expect(result?.svg).toContain("<path");
    expect(result?.svg).not.toMatch(/<use[^>]*xlink:href="#MJX/);
  });

  it("display é maior que inline para a mesma expressão", () => {
    const inline = renderMath("\\sum_{i=1}^{n} i", false);
    const display = renderMath("\\sum_{i=1}^{n} i", true);

    expect((display?.heightEx ?? 0) > (inline?.heightEx ?? 0)).toBe(true);
  });

  it("não gera `\\href` — o pacote `html` fica de fora de propósito", () => {
    // Excluir o pacote é mais forte que sanitizar depois: a marcação perigosa não chega a existir.
    const result = renderMath("\\href{javascript:alert(1)}{clique}", false);

    expect(result?.svg ?? "").not.toContain("javascript:");
    expect(result?.svg ?? "").not.toContain("<a ");
  });

  it("LaTeX quebrado não derruba a conversão", () => {
    // Quem está digitando ainda vai fechar a chave.
    expect(() => renderMath("\\frac{", false)).not.toThrow();
  });

  it("a segunda conversão da mesma fórmula vem do cache", () => {
    const first = renderMath("\\alpha + \\beta", false);
    const second = renderMath("\\alpha + \\beta", false);

    // Mesma referência: sem cache, cada tecla mandaria o MathJax refazer todas as fórmulas.
    expect(second).toBe(first);
  });
});

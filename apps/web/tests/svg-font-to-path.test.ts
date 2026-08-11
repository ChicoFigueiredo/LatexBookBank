import { describe, expect, it } from "vitest";

import { svgFontToPath } from "@modules/latex-knowledge/domain/svg-font-to-path";

/**
 * A conversão das miniaturas do legado.
 *
 * As 2.596 miniaturas usam SVG font — `<font>`/`<glyph>` referenciados por um `<text>` —, formato
 * removido do Chrome, do Firefox e do Safari. Elas renderizam **em branco, sem erro nenhum**: só
 * se descobre olhando o conteúdo. O contorno está no `d` do glifo, e a conversão é geométrica.
 *
 * O material aqui é recortado do acervo real, não inventado.
 */

/** `\alpha`, como está gravado. */
const ALPHA = `<?xml version='1.0' encoding='ISO-8859-1'?>
<svg height='12.12pt' version='1.1' viewBox='39 54 7.068 12.12' width='7.068pt' xmlns='http://www.w3.org/2000/svg'>
<title>\\alpha</title>
<defs>
<font horiz-adv-x='0' id='cmmi12'>
<font-face ascent='750' descent='-250' font-family='cmmi12' units-per-em='1000'/>
<missing-glyph d=''/>
<glyph d='M463 253C463 350 408 441 302 441Z' glyph-name='alpha' horiz-adv-x='622' unicode='&#13323;'/>
</font>
</defs>
<style type='text/css'><![CDATA[
text.f0 {font-family:cmmi12;font-size:12}
]]>
</style>
<g id='page1'>
<text class='f0' x='39' y='66'>&#13323;</text>
</g>
</svg>`;

describe("svgFontToPath", () => {
  it("troca o `<text>` por um `<path>` com o contorno do glifo", () => {
    const converted = svgFontToPath(ALPHA);

    expect(converted).toContain('d="M463 253C463 350 408 441 302 441Z"');
    expect(converted).not.toContain("<text");
    expect(converted).not.toContain("<font");
  });

  it("inverte o eixo Y — fonte tem o y para cima, SVG tem para baixo", () => {
    // `font-size 12 / units-per-em 1000` = 0.012, e o Y sai negativo. Sem a inversão o símbolo
    // apareceria de cabeça para baixo e fora do viewBox.
    expect(svgFontToPath(ALPHA)).toContain("scale(0.012 -0.012)");
  });

  it("posiciona o contorno onde o `<text>` estava", () => {
    expect(svgFontToPath(ALPHA)).toContain("translate(39 66)");
  });

  it("preserva o viewBox e descarta width/height em `pt`", () => {
    const converted = svgFontToPath(ALPHA) ?? "";

    expect(converted).toContain('viewBox="39 54 7.068 12.12"');
    // Tamanho fixo em `pt` amarraria a miniatura; quem dimensiona é o CSS da palette.
    expect(converted).not.toContain("pt'");
    expect(converted).not.toMatch(/width=/);
  });

  it("pinta com `currentColor` para a miniatura seguir o tema", () => {
    expect(svgFontToPath(ALPHA)).toContain('fill="currentColor"');
  });

  it("lê o glifo cujo `unicode` é o próprio `>`", () => {
    // Como está no acervo: `unicode='>'` e o caractere cru dentro do `<text>`. Três símbolos
    // (`>`, `\\textgreater`, `\\textrangle`) saíam em branco porque parar a leitura de atributos
    // no primeiro `>` cortava a lista no meio de `unicode='>'`.
    const maior = ALPHA.replace("unicode='&#13323;'", "unicode='>'").replace(
      "<text class='f0' x='39' y='66'>&#13323;</text>",
      "<text class='f0' x='39' y='66'>></text>",
    );

    expect(svgFontToPath(maior)).toContain("<path");
  });

  it("entende também a entidade nomeada, que o acervo de hoje não usa", () => {
    const maior = ALPHA.replace("unicode='&#13323;'", "unicode='>'").replace(
      "<text class='f0' x='39' y='66'>&#13323;</text>",
      "<text class='f0' x='39' y='66'>&gt;</text>",
    );

    expect(svgFontToPath(maior)).toContain("<path");
  });

  it("avança o cursor mesmo em caractere sem contorno", () => {
    // Sem o avanço, os 86 símbolos de vários glifos empilhariam tudo no mesmo ponto.
    const dois = ALPHA.replace(
      "<text class='f0' x='39' y='66'>&#13323;</text>",
      "<text class='f0' x='39' y='66'>&#13323;&#13323;</text>",
    );
    const converted = svgFontToPath(dois) ?? "";

    expect(converted).toContain("translate(39 66)");
    // 39 + 622 × 0.012 = 46.464
    expect(converted).toContain("translate(46.464 66)");
  });

  it("devolve `null` quando não há SVG font a converter", () => {
    expect(svgFontToPath('<svg viewBox="0 0 1 1"><path d="M0 0Z"/></svg>')).toBeNull();
  });

  it("devolve `null` quando o `<text>` não referencia glifo nenhum", () => {
    // Guardar um SVG que desenha nada é pior que guardar `null`: o símbolo perde a chance de
    // cair no Unicode ou no próprio comando.
    const vazio = ALPHA.replace(
      "<text class='f0' x='39' y='66'>&#13323;</text>",
      "<text class='f0' x='39' y='66'>&#99999;</text>",
    );
    expect(svgFontToPath(vazio)).toBeNull();
  });
});

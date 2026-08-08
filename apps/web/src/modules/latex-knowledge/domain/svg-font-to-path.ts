/**
 * Converte as miniaturas do legado de **SVG font** para `<path>`.
 *
 * As 2.596 miniaturas saíram do `dvisvgm` num formato que hoje não renderiza em lugar nenhum: o
 * glifo é declarado dentro de `<font>`/`<glyph>` e referenciado por um `<text>`. SVG fonts foram
 * removidas do Chrome, do Firefox e do Safari — o desenho **aparece em branco**, sem erro nenhum.
 * Só se descobre isso olhando o conteúdo; um `<img>` com um SVG vazio não reclama.
 *
 * O contorno, porém, está lá: o atributo `d` do `<glyph>` é a mesma path data de sempre. A
 * conversão é geométrica e fechada:
 *
 * - coordenadas de fonte têm o **y para cima** e origem na linha de base;
 * - SVG tem o y para baixo;
 * - a escala é `font-size / units-per-em`.
 *
 * Daí `translate(x, y) scale(s, -s)` posicionar o contorno exatamente onde o `<text>` estava.
 *
 * É feito **na importação**, não na renderização: a conversão é determinística e o resultado é
 * menor que a origem — pagá-la a cada abertura da palette seria trabalho repetido para sempre.
 */

interface GlyphFont {
  readonly unitsPerEm: number;
  /** Ponto de código → path data do contorno. */
  readonly glyphs: ReadonlyMap<number, string>;
  /** Ponto de código → avanço horizontal, em unidades de em. */
  readonly advances: ReadonlyMap<number, number>;
}

/** Lê um atributo aceitando aspas simples ou duplas — o legado usa as duas. */
function attribute(source: string, name: string): string | null {
  const match = new RegExp(`${name}\\s*=\\s*(['"])([\\s\\S]*?)\\1`).exec(source);
  return match?.[2] ?? null;
}

/**
 * As cinco entidades nomeadas do XML.
 *
 * O acervo de hoje não usa nenhuma — o glifo do sinal de maior está gravado como `>` cru, que é
 * legal dentro de conteúdo de elemento. Mas `&gt;` também é, e um exportador diferente poderia
 * emiti-lo; sem esta tabela ele viraria quatro glifos inexistentes e a miniatura sairia em branco.
 */
const NAMED_ENTITIES: Readonly<Record<string, number>> = {
  lt: 0x3c,
  gt: 0x3e,
  amp: 0x26,
  quot: 0x22,
  apos: 0x27,
};

/** `&#13323;`, `&#x3b1;`, `&gt;` e o caractere cru são quatro formas da mesma coisa. */
function decodeEntities(text: string): number[] {
  const codes: number[] = [];
  const pattern = /&#(x?)([0-9a-fA-F]+);|&(\w+);|([\s\S])/g;

  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    if (match[2] !== undefined) {
      codes.push(parseInt(match[2], match[1] === "x" ? 16 : 10));
    } else if (match[3] !== undefined) {
      const named = NAMED_ENTITIES[match[3]];
      if (named !== undefined) codes.push(named);
    } else if (match[4] !== undefined && match[4].trim() !== "") {
      codes.push(match[4].codePointAt(0) ?? 0);
    }
  }
  return codes;
}

function parseFonts(svg: string): Map<string, GlyphFont> {
  const fonts = new Map<string, GlyphFont>();

  for (const block of svg.matchAll(/<font\b([^>]*)>([\s\S]*?)<\/font>/g)) {
    const header = block[1] ?? "";
    const body = block[2] ?? "";

    const face = /<font-face\b([^>]*)\/?>/.exec(body);
    const unitsPerEm = Number(attribute(face?.[1] ?? "", "units-per-em") ?? "1000");

    const glyphs = new Map<number, string>();
    const advances = new Map<number, number>();

    // Até o `/>`, e não até o primeiro `>`: o glifo do sinal de maior é declarado como
    // `unicode='>'`, e parar no primeiro `>` cortava a lista de atributos no meio. Três símbolos
    // do acervo — `>`, `\textgreater` e `\textrangle` — saíam em branco por causa disso.
    // Path data não contém `/`, então o `/>` é um limite seguro.
    for (const glyph of body.matchAll(/<glyph\b([\s\S]*?)\/>/g)) {
      const attributes = glyph[1] ?? "";
      const unicode = attribute(attributes, "unicode");
      const d = attribute(attributes, "d");
      if (unicode === null || d === null || d === "") continue;

      const code = decodeEntities(unicode)[0];
      if (code === undefined) continue;

      glyphs.set(code, d);
      advances.set(code, Number(attribute(attributes, "horiz-adv-x") ?? "0"));
    }

    // A família é o que o CSS referencia; o `id` é reserva, porque nem toda versão do dvisvgm
    // preenche os dois.
    const family = attribute(face?.[1] ?? "", "font-family") ?? attribute(header, "id");
    if (family !== null) fonts.set(family, { unitsPerEm, glyphs, advances });
  }

  return fonts;
}

/** `text.f0 {font-family:cmmi12;font-size:12}` — o tamanho vem com ou sem `px`. */
function parseTextClasses(svg: string): Map<string, { family: string; size: number }> {
  const classes = new Map<string, { family: string; size: number }>();

  for (const rule of svg.matchAll(
    /text\.(\w+)\s*\{[^}]*font-family\s*:\s*([^;}]+)[^}]*font-size\s*:\s*([\d.]+)/g,
  )) {
    const name = rule[1];
    const family = rule[2]?.trim();
    const size = Number(rule[3]);
    if (name && family && Number.isFinite(size)) classes.set(name, { family, size });
  }

  return classes;
}

/**
 * Devolve o SVG com os glifos virados contorno, ou `null` se não houver o que converter.
 *
 * `null` é resposta legítima: 145 símbolos não têm miniatura nenhuma, e um SVG que já viesse em
 * `<path>` sairia daqui inalterado por não ter `<font>`.
 */
export function svgFontToPath(svg: string): string | null {
  if (!svg.includes("<font")) return null;

  const fonts = parseFonts(svg);
  const classes = parseTextClasses(svg);
  const paths: string[] = [];

  for (const element of svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
    const attributes = element[1] ?? "";
    const content = element[2] ?? "";

    const className = attribute(attributes, "class");
    const style = className === null ? undefined : classes.get(className);
    if (style === undefined) continue;

    const font = fonts.get(style.family);
    if (font === undefined) continue;

    const scale = style.size / font.unitsPerEm;
    let x = Number(attribute(attributes, "x") ?? "0");
    const y = Number(attribute(attributes, "y") ?? "0");

    for (const code of decodeEntities(content)) {
      const d = font.glyphs.get(code);
      if (d !== undefined) {
        // O `-scale` no eixo Y é a conversão de "y para cima" da fonte para "y para baixo" do SVG.
        paths.push(`<path transform="translate(${x} ${y}) scale(${scale} ${-scale})" d="${d}"/>`);
      }
      // O avanço acontece mesmo sem glifo: um caractere sem contorno ainda ocupa espaço, e ignorar
      // isso empilharia os seguintes em cima uns dos outros nos 86 símbolos de vários glifos.
      x += (font.advances.get(code) ?? 0) * scale;
    }
  }

  if (paths.length === 0) return null;

  const viewBox = attribute(svg, "viewBox");
  if (viewBox === null) return null;

  // `width`/`height` do original vêm em `pt` e amarrariam o tamanho na tela. A palette dimensiona
  // pelo CSS; o `viewBox` sozinho preserva a proporção.
  // `fill="currentColor"` deixa a miniatura seguir o tema — o original era preto fixo.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="currentColor">` +
    `${paths.join("")}</svg>`
  );
}

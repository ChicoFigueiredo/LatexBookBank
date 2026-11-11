import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { SVG } from "mathjax-full/js/output/svg.js";

import { parseMathSvg, type MathSvg } from "@modules/preview/domain/math-svg";
import { BRAZILIAN_OPERATORS } from "@modules/rendering/domain/latex-profile";

/**
 * MathJax **do pacote local**, nunca de CDN.
 *
 * É a mesma exigência que valeu para o Monaco (§48: o app roda com a internet desligada), e o
 * mesmo risco: a forma mais comum de usar MathJax em React baixa o motor de um CDN em tempo de
 * execução e falha **em silêncio** sem rede — a fórmula simplesmente não aparece.
 *
 * Três escolhas moldam este arquivo:
 *
 * **`liteAdaptor` e não o adaptador de navegador.** O MathJax não precisa do DOM para produzir
 * SVG, e sem DOM isto roda igual no navegador, no Node e dentro do Vitest — o que torna a
 * conversão testável sem subir uma página.
 *
 * **`fontCache: "none"`.** O padrão (`"global"`) emite os glifos uma vez e referencia por `<use>`
 * apontando para fora do SVG. Isso quebraria a máscara CSS, que só enxerga o próprio arquivo.
 * Cada fórmula sai maior e autocontida — e autocontida é o que a máscara exige.
 *
 * **Lista de pacotes curada, sem `html`.** O pacote `html` do MathJax dá `\href`, `\class` e
 * `\style`, isto é, permite que o LaTeX de uma questão emita marcação arbitrária. Não incluí-lo é
 * mais forte do que sanitizar depois: a marcação perigosa não chega a ser gerada.
 */

const PACKAGES = [
  "base",
  "ams",
  "amscd",
  "boldsymbol",
  "braket",
  "cancel",
  "color",
  "mathtools",
  "newcommand",
  "noundefined",
  "textmacros",
  "unicode",
];

let convert: ((latex: string, display: boolean) => string) | null = null;

function ensureEngine(): (latex: string, display: boolean) => string {
  if (convert !== null) return convert;

  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);

  const document = mathjax.document("", {
    // Os operadores da notação brasileira (`\tg`, `\sen`), os mesmos do preâmbulo da compilação.
    InputJax: new TeX({
      packages: PACKAGES,
      macros: Object.fromEntries(
        BRAZILIAN_OPERATORS.map((name) => [name, `\\operatorname{${name}}`]),
      ),
    }),
    OutputJax: new SVG({ fontCache: "none" }),
  });

  convert = (latex, display) => adaptor.outerHTML(document.convert(latex, { display }) as never);

  return convert;
}

/**
 * Cache de fórmulas já convertidas.
 *
 * Editar um enunciado muda uma fórmula e deixa as outras iguais; sem cache, cada tecla mandaria
 * o MathJax refazer todas de novo, e é aí que o preview passaria a engasgar. A chave inclui o
 * modo porque a mesma expressão tem tamanhos diferentes inline e em display.
 */
const cache = new Map<string, MathSvg | null>();

/** Acima disso o cache vira um vazamento; o acervo mais denso não passa de algumas centenas. */
const CACHE_LIMIT = 2000;

export function renderMath(latex: string, display: boolean): MathSvg | null {
  const key = `${display ? "D" : "I"}\u0000${latex}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let result: MathSvg | null;
  try {
    result = parseMathSvg(ensureEngine()(latex, display));
  } catch {
    // LaTeX que o MathJax não digere não pode derrubar o preview: quem está digitando ainda vai
    // fechar a chave. O componente mostra o texto cru, que é informação melhor que um espaço.
    result = null;
  }

  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, result);
  return result;
}

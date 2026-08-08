/**
 * As medidas de uma fórmula renderizada, lidas do SVG que o MathJax produz.
 *
 * Existe porque o preview **não injeta o SVG no documento** — ele o usa como máscara CSS, e uma
 * máscara não carrega consigo largura, altura nem linha de base. Esses três números são o que faz
 * `$x^2$` sentar na linha do texto em vez de flutuar acima dela.
 *
 * Tudo em `ex`, que é a unidade que o MathJax emite: um `ex` é a altura do "x" da fonte corrente,
 * então a fórmula acompanha o tamanho do texto ao redor sem nenhuma conta nossa.
 */

export interface MathSvg {
  /** O elemento `<svg>` sozinho, sem o `<mjx-container>` em volta. */
  readonly svg: string;
  readonly widthEx: number;
  readonly heightEx: number;
  /**
   * Quanto a fórmula desce abaixo da linha de base, em `ex`.
   *
   * O MathJax emite como `vertical-align` negativo. Sem isto, uma fração inline ficaria apoiada
   * na linha em vez de centrada nela, e o parágrafo pareceria ter linhas de alturas diferentes.
   */
  readonly verticalAlignEx: number;
}

const numberFrom = (source: string, pattern: RegExp): number => {
  const match = pattern.exec(source);
  const value = Number(match?.[1]);
  return Number.isFinite(value) ? value : 0;
};

/**
 * Extrai `<svg>` e medidas da saída do MathJax.
 *
 * Devolve `null` quando não há `<svg>` — o que acontece se a saída mudar de formato numa versão
 * futura. Melhor mostrar o LaTeX cru do que um retângulo vazio que ninguém sabe explicar.
 */
export function parseMathSvg(mathJaxOutput: string): MathSvg | null {
  const start = mathJaxOutput.indexOf("<svg");
  const end = mathJaxOutput.lastIndexOf("</svg>");
  if (start === -1 || end === -1) return null;

  const svg = mathJaxOutput.slice(start, end + "</svg>".length);

  return {
    svg,
    widthEx: numberFrom(svg, /width="([\d.]+)ex"/),
    heightEx: numberFrom(svg, /height="([\d.]+)ex"/),
    // O sinal fica invertido de propósito: o CSS diz "desce -2.063ex", e aqui guardamos 2.063
    // como "profundidade", que é como a tipografia chama e como o componente usa.
    verticalAlignEx: -numberFrom(svg, /vertical-align:\s*(-?[\d.]+)ex/),
  };
}

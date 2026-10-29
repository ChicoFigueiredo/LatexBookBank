/**
 * A caixa normalizada e as conversões dela — geometria de página, de todos os módulos (ARQ-12).
 *
 * Morava em `assets/domain/source-anchor.ts`, e onze arquivos do scan importavam de lá; a mesma
 * conversão de pontos para fração estava copiada no scan (`toNormalizedBox`) e no reconhecimento
 * (`caixaNormalizada`). Uma primitiva presa a um módulo de feature obriga quem a usa a arrastar o
 * módulo junto, e trocar o formato dela quebrava o scan por dentro do assets.
 *
 * A regra que ela protege é a D28: **nenhuma coordenada absoluta é persistida**. Um retângulo em
 * pixels só significa alguma coisa junto do DPI em que foi medido; normalizado em 0..1, o mesmo
 * retângulo vale em 72, 150 ou 600 DPI, na tela e na impressão.
 */

export interface NormalizedBox {
  /** Origem no canto **superior esquerdo** da página, como toda API de imagem que vamos usar. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Um retângulo em pixels de um render concreto. Nunca guardado (D28). */
export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Um retângulo em **pontos do PDF**, origem no canto superior esquerdo, y para baixo — a mesma
 * convenção da caixa normalizada.
 *
 * O scan e a segmentação raciocinam em pontos porque é neles que as tolerâncias fazem sentido ("a
 * calha mede 3 a 8 pt"); só vira fração de página na hora de propor uma âncora.
 */
export interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** O tamanho da página, na unidade do retângulo que se converte (pontos ou pixels). */
export interface PageSize {
  readonly width: number;
  readonly height: number;
}

const PRECISION = 1e6;

/**
 * Seis casas decimais: bastam para um pixel em 600 DPI numa página A4, e guardar o `float` inteiro
 * faria dois desenhos idênticos gerarem hashes diferentes.
 */
export const roundFraction = (value: number): number => Math.round(value * PRECISION) / PRECISION;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * O retângulo em pixels, para um tamanho de página concreto.
 *
 * É aqui que o normalizado vira absoluto — e **só aqui**, no momento de recortar. O resultado
 * nunca é guardado: ele vale para aquele render, e o próximo pode ser em outro DPI.
 *
 * Arredonda para fora (`floor` na origem, `ceil` no tamanho): meio pixel a mais no recorte é
 * invisível; meio pixel a menos corta a serifa da primeira letra.
 */
export function pixelRectFor(box: NormalizedBox, page: PageSize): PixelRect {
  const x = Math.floor(box.x * page.width);
  const y = Math.floor(box.y * page.height);

  return {
    x,
    y,
    width: Math.min(Math.ceil(box.width * page.width), page.width - x),
    height: Math.min(Math.ceil(box.height * page.height), page.height - y),
  };
}

/**
 * A caixa normalizada a partir de um retângulo desenhado em pixels.
 *
 * O caminho inverso, usado pela tela: a pessoa arrasta sobre uma imagem de 1240×1754 e o que se
 * guarda é a fração. Sem isto, cada tela guardaria o próprio DPI junto do dado.
 */
export function normalizedBoxFrom(rect: PixelRect, page: PageSize): NormalizedBox {
  return {
    x: roundFraction(rect.x / page.width),
    y: roundFraction(rect.y / page.height),
    width: roundFraction(rect.width / page.width),
    height: roundFraction(rect.height / page.height),
  };
}

/**
 * A caixa em frações da página, a partir de um retângulo em pontos, presa às bordas.
 *
 * Prender em vez de recusar: quem desenhou foi a aritmética, não a pessoa, e uma folga que vaza
 * dois pontos na margem não é erro de ninguém. (A caixa que a pessoa desenha passa por
 * `normalizeAnchor`, que recusa.)
 */
export function toNormalizedBox(rect: Rect, page: PageSize): NormalizedBox {
  const x0 = clamp(rect.x0, 0, page.width);
  const y0 = clamp(rect.y0, 0, page.height);
  const x1 = clamp(rect.x1, x0, page.width);
  const y1 = clamp(rect.y1, y0, page.height);

  const x = roundFraction(x0 / page.width);
  const y = roundFraction(y0 / page.height);

  return {
    x,
    y,
    width: Math.min(roundFraction((x1 - x0) / page.width), roundFraction(1 - x)),
    height: Math.min(roundFraction((y1 - y0) / page.height), roundFraction(1 - y)),
  };
}

/** O retângulo em pontos de uma caixa normalizada, para uma página concreta. */
export function fromNormalizedBox(box: NormalizedBox, page: PageSize): Rect {
  return {
    x0: box.x * page.width,
    y0: box.y * page.height,
    x1: (box.x + box.width) * page.width,
    y1: (box.y + box.height) * page.height,
  };
}

/**
 * A caixa como retângulo de cantos, na mesma unidade dela — para medir sobreposição entre duas
 * caixas normalizadas sem passar por uma página.
 */
export function boxRect(box: NormalizedBox): Rect {
  return { x0: box.x, y0: box.y, x1: box.x + box.width, y1: box.y + box.height };
}

/**
 * Onde uma questão estava na fonte — em coordenadas **normalizadas** (D28).
 *
 * A regra que este arquivo protege: nenhuma coordenada absoluta é persistida. Um retângulo em
 * pixels só significa alguma coisa junto do DPI em que foi medido; guardá-lo assim transforma
 * "onde a questão estava na página" em "onde ela estava naquela renderização", e a próxima, em
 * outro zoom, aponta para outro lugar.
 *
 * Normalizado em 0..1, o mesmo retângulo vale em 72, 150 ou 600 DPI, na tela e na impressão — e
 * continua valendo se o PDF for reprocessado por outra ferramenta.
 *
 * Ver spec §18 · D28 · issue #121.
 */

export interface NormalizedBox {
  /** Origem no canto **superior esquerdo** da página, como toda API de imagem que vamos usar. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SourceAnchorInput {
  readonly pageNumber: number;
  readonly box: NormalizedBox;
  /** Graus, quando a página está girada. `null` é o caso comum. */
  readonly rotation: number | null;
}

export class InvalidAnchorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAnchorError";
  }
}

/**
 * Valida e normaliza o que veio da tela.
 *
 * Recusa em vez de aparar. Uma caixa que sai da página é um erro de quem a desenhou — aparar
 * silenciosamente devolveria um recorte diferente do que a pessoa viu, e a diferença só
 * apareceria no crop.
 *
 * A exceção é o arredondamento: seis casas decimais bastam para um pixel em 600 DPI numa página
 * A4, e guardar o `float` inteiro faria dois desenhos idênticos gerarem hashes diferentes.
 */
export function normalizeAnchor(input: SourceAnchorInput): SourceAnchorInput {
  const { pageNumber, box, rotation } = input;

  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new InvalidAnchorError("A página precisa ser um inteiro a partir de 1.");
  }

  for (const [name, value] of Object.entries(box)) {
    if (!Number.isFinite(value)) {
      throw new InvalidAnchorError(`\`${name}\` precisa ser um número.`);
    }
  }

  if (box.width <= 0 || box.height <= 0) {
    throw new InvalidAnchorError("O recorte precisa ter largura e altura maiores que zero.");
  }
  if (box.x < 0 || box.y < 0 || box.x + box.width > 1 || box.y + box.height > 1) {
    throw new InvalidAnchorError(
      "O recorte sai da página. As coordenadas são normalizadas: 0 é a borda, 1 é o lado oposto.",
    );
  }
  if (rotation !== null && ![0, 90, 180, 270].includes(rotation)) {
    throw new InvalidAnchorError("A rotação precisa ser 0, 90, 180 ou 270 graus.");
  }

  return {
    pageNumber,
    box: {
      x: round(box.x),
      y: round(box.y),
      width: round(box.width),
      height: round(box.height),
    },
    rotation: rotation === 0 ? null : rotation,
  };
}

const PRECISION = 1e6;
const round = (value: number): number => Math.round(value * PRECISION) / PRECISION;

export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * O retângulo em pixels, para um tamanho de página concreto.
 *
 * É aqui que o normalizado vira absoluto — e **só aqui**, no momento de recortar. O resultado
 * nunca é guardado: ele vale para aquele render, e o próximo pode ser em outro DPI.
 *
 * Arredonda para fora (`floor` na origem, `ceil` no tamanho): meio pixel a mais no recorte é
 * invisível; meio pixel a menos corta a serifa da primeira letra.
 */
export function pixelRectFor(
  box: NormalizedBox,
  page: { readonly width: number; readonly height: number },
): PixelRect {
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
export function normalizedBoxFrom(
  rect: PixelRect,
  page: { readonly width: number; readonly height: number },
): NormalizedBox {
  return {
    x: round(rect.x / page.width),
    y: round(rect.y / page.height),
    width: round(rect.width / page.width),
    height: round(rect.height / page.height),
  };
}

/**
 * A cadeia de proveniência, em texto.
 *
 * "Voltar à origem" é o aceite da fase, e o que ele exige é que sempre dê para responder: esta
 * questão veio de qual arquivo, em que página, em que pedaço. Um crop sem essa cadeia é uma
 * imagem órfã que ninguém consegue conferir contra a fonte.
 */
export function describeProvenance(anchor: {
  readonly sourceFilename: string | null;
  readonly pageNumber: number;
  readonly box: NormalizedBox;
}): string {
  const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;

  return (
    `${anchor.sourceFilename ?? "fonte desconhecida"} · página ${anchor.pageNumber} · ` +
    `recorte em ${percent(anchor.box.x)},${percent(anchor.box.y)} ` +
    `com ${percent(anchor.box.width)}×${percent(anchor.box.height)}`
  );
}

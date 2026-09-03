import type {
  PaginaDeTexto,
  PalavraNaPagina,
} from "@modules/recognition/domain/segmentar-pagina";

/**
 * O adapter que lê a camada de texto do `pdf.js` e devolve o formato que o domínio de
 * "Estimar questões" espera (`segmentarPagina`).
 *
 * Por que um adapter e não a chamada direta na tela: o `pdf.js` fala a língua dele — origem no
 * canto **inferior** esquerdo, y crescendo para cima, e um item por `TextItem` **ou**
 * `TextMarkedContent` misturados no mesmo array. O domínio fala outra — origem no **topo**, y
 * para baixo, só palavras de verdade. A conversão mora aqui, isolada, para o domínio continuar
 * puro e para um erro de sinal (inverter o y) aparecer num teste de coordenada, não escondido
 * dentro de `segmentarPagina`.
 *
 * Ver spec da estimativa de questões · issue da segmentação.
 */

/** A fatia do `Page` do `pdf.js` que este adapter usa — só o suficiente para não depender do tipo inteiro. */
interface PaginaDoPdf {
  readonly getViewport: (options: {
    readonly scale: number;
  }) => { readonly width: number; readonly height: number };
  readonly getTextContent: () => Promise<{ readonly items: readonly unknown[] }>;
}

/**
 * Confere, em runtime, que `page` tem a forma que este módulo precisa.
 *
 * `page` chega como `unknown` de propósito — quem chama é a tela, que só tem o que o `pdf.js`
 * devolveu sem tipo (o projeto evita `any`). Checar aqui, uma vez, é o que permite ao resto da
 * função assumir a forma sem casts espalhados.
 */
function comoPaginaDoPdf(page: unknown): PaginaDoPdf {
  if (typeof page !== "object" || page === null) {
    throw new TypeError("lerCamadaDeTexto espera uma página do pdf.js, recebeu " + typeof page);
  }

  const candidata = page as Record<string, unknown>;
  if (typeof candidata.getViewport !== "function" || typeof candidata.getTextContent !== "function") {
    throw new TypeError(
      "lerCamadaDeTexto espera uma página do pdf.js (com getViewport e getTextContent).",
    );
  }

  return candidata as unknown as PaginaDoPdf;
}

/** A matriz de transformação do `TextItem`: `[a, b, c, d, e, f]`, onde `e` e `f` são a origem. */
type Matriz = readonly [number, number, number, number, number, number];

/** Os campos de um `TextItem` que interessam, depois de confirmar que o item é mesmo um. */
interface CamposDeTexto {
  readonly str: string;
  readonly width: number;
  readonly height: number;
  readonly transform: Matriz;
}

/**
 * Narrowing explícito de um item de `getTextContent().items`.
 *
 * O array mistura `TextItem` (o que queremos) com `TextMarkedContent` (marcação de estrutura, sem
 * `str`) quando `includeMarkedContent` está ligado — e mesmo sem isso, nada garante em tipo que
 * `transform` chega com seis números. Devolver `null` para o que não serve é mais simples que um
 * type guard genérico, e é só aqui que se decide o que é "palavra".
 */
function camposDeTexto(item: unknown): CamposDeTexto | null {
  if (typeof item !== "object" || item === null) return null;

  const registro = item as Record<string, unknown>;
  const { str, width, height, transform } = registro;

  if (typeof str !== "string") return null;
  if (typeof width !== "number" || typeof height !== "number") return null;
  if (!Array.isArray(transform) || transform.length < 6) return null;
  if (!transform.every((valor) => typeof valor === "number")) return null;

  // `slice(0, 6)`: só a origem interessa (índices 4 e 5), e fixar em seis posições é o que dá ao
  // TypeScript a tupla — sem isso, `noUncheckedIndexedAccess` trataria `transform[4]` como
  // `number | undefined` mesmo depois do `length < 6` já ter sido checado acima.
  return {
    str,
    width,
    height,
    transform: transform.slice(0, 6) as unknown as Matriz,
  };
}

/**
 * Lê a camada de texto de uma página do `pdf.js` no formato que `segmentarPagina` espera.
 *
 * A conversão que importa: `transform[4]` e `transform[5]` (o `e` e o `f` da matriz) são a
 * origem do item em pontos do PDF, com o canto **inferior** esquerdo como zero e y crescendo
 * para **cima** — a convenção do PDF desde sempre. O domínio pede o canto **superior** esquerdo,
 * y para baixo, porque é assim que toda caixa normalizada deste projeto já é lida (D28, ver
 * `source-anchor.ts`). O flip é `alturaDaPagina - f - altura`: `f` é onde o texto *termina*
 * embaixo, então subtrair a altura devolve o topo do item antes de inverter o eixo. Errar este
 * sinal não dá erro nenhum — só desenha tudo de cabeça para baixo, por isso está coberto por
 * teste de coordenada, não só de forma.
 */
export async function lerCamadaDeTexto(page: unknown): Promise<PaginaDeTexto> {
  const pdfPage = comoPaginaDoPdf(page);

  const viewport = pdfPage.getViewport({ scale: 1 });
  const conteudo = await pdfPage.getTextContent();

  const palavras: PalavraNaPagina[] = [];

  for (const item of conteudo.items) {
    const campos = camposDeTexto(item);
    if (campos === null) continue;

    // NFC: o texto extraído de um PDF gerado por LaTeX costuma vir decomposto (NFD) — "á" como
    // "a" + acento combinante. Regex e comparação de string contra um literal composto falham em
    // silêncio contra isso; já foi bug real neste projeto (Bun/`String.raw`), e aqui a fonte é
    // ainda mais garantida de vir decomposta.
    const texto = campos.str.normalize("NFC");
    if (texto.trim() === "") continue; // vazio ou só espaço não é palavra — não ajuda a segmentar

    const [, , , , e, f] = campos.transform;

    palavras.push({
      texto,
      x: e,
      y: viewport.height - f - campos.height,
      largura: campos.width,
      altura: campos.height,
    });
  }

  return { largura: viewport.width, altura: viewport.height, palavras };
}

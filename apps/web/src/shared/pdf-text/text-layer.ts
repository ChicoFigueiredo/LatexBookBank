/**
 * A camada de texto de uma página de PDF, no formato que a segmentação lê (ARQ-06).
 *
 * Dois leitores chegam aqui: o do navegador (`assets/ui/pdf-text-layer.ts`, a captura manual, que
 * lê o `pdf.js` direto) e o do motor do scan (`scan/domain/page.ts`, que já juntou os trechos em
 * linhas). Os dois partem da **linha de base** e do corpo do trecho, e a caixa da palavra sai
 * daqui, de um jeito só: o topo é a linha de base menos o corpo. Antes, o scan recuperava a linha
 * de base da caixa da linha com um `0.22` copiado da métrica do motor — e errava o glifo pendurado
 * da fonte de extensão do TeX (∑, ∫ e parênteses grandes), que caía uns 24 pt abaixo do lugar.
 *
 * Coordenadas em pontos do PDF, origem no topo-esquerda (D28).
 */

/** Uma palavra da camada de texto, em pontos do PDF, origem no topo-esquerda. */
export interface PalavraNaPagina {
  readonly texto: string;
  readonly x: number;
  readonly y: number;
  readonly largura: number;
  readonly altura: number;
}

export interface PaginaDeTexto {
  readonly largura: number;
  readonly altura: number;
  readonly palavras: readonly PalavraNaPagina[];
}

/** A palavra a partir da linha de base e do corpo: o topo é a base menos o corpo. */
export function palavraNaLinhaDeBase(trecho: {
  readonly texto: string;
  readonly x: number;
  readonly largura: number;
  readonly linhaDeBase: number;
  readonly corpo: number;
}): PalavraNaPagina {
  return {
    texto: trecho.texto,
    x: trecho.x,
    y: trecho.linhaDeBase - trecho.corpo,
    largura: trecho.largura,
    altura: trecho.corpo,
  };
}

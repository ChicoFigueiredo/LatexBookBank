import { describe, expect, it } from "vitest";

import { lerCamadaDeTexto } from "@modules/assets/ui/pdf-text-layer";

/**
 * O adapter que lê a camada de texto do `pdf.js` para a estimativa de questões.
 *
 * O dublê de página é um objeto literal — não precisa de `pdf.js` real, só da forma que o
 * adapter consulta: `getViewport` e `getTextContent`. O que se testa aqui é a conversão de
 * coordenadas (o ponto onde um sinal errado passaria despercebido) e a normalização de texto.
 */

interface ItemFake {
  readonly str: string;
  readonly width: number;
  readonly height: number;
  readonly transform: readonly number[];
}

/** Um `TextItem` plausível: em branco, some no meio da página A4 (595×842pt), como o pdf.js mede. */
const item = (sobre: Partial<ItemFake> = {}): ItemFake => ({
  str: "questão",
  width: 40,
  height: 12,
  transform: [1, 0, 0, 1, 72, 700],
  ...sobre,
});

const paginaFake = (
  items: readonly unknown[],
  viewport: { readonly width: number; readonly height: number } = { width: 595, height: 842 },
) => ({
  getViewport: (_opcoes: { readonly scale: number }) => viewport,
  getTextContent: async () => ({ items }),
});

describe("lerCamadaDeTexto", () => {
  it("converte a origem do pdf.js (inferior esquerdo, y para cima) para o topo (y para baixo)", async () => {
    // f=500, altura=12, página de 792pt: y_topo = 792 - 500 - 12 = 280.
    const pagina = paginaFake([item({ transform: [1, 0, 0, 1, 100, 500], height: 12 })], {
      width: 595,
      height: 792,
    });

    const resultado = await lerCamadaDeTexto(pagina);

    expect(resultado.palavras).toHaveLength(1);
    expect(resultado.palavras[0]!.x).toBe(100);
    expect(resultado.palavras[0]!.y).toBe(280);
    expect(resultado.palavras[0]!.largura).toBe(40);
    expect(resultado.palavras[0]!.altura).toBe(12);
  });

  it("devolve a página inteira nas dimensões do viewport em escala 1", async () => {
    const pagina = paginaFake([], { width: 595, height: 842 });

    const resultado = await lerCamadaDeTexto(pagina);

    expect(resultado.largura).toBe(595);
    expect(resultado.altura).toBe(842);
  });

  it("normaliza para NFC — o texto de PDF gerado por LaTeX costuma vir decomposto (NFD)", async () => {
    // "questão" decomposto: "a" (U+0061) seguido do til combinante (U+0303), em vez do "ã" pronto.
    const decomposto = "questão";
    expect(decomposto).not.toBe(decomposto.normalize("NFC")); // confirma que o dublê é mesmo NFD

    const pagina = paginaFake([item({ str: decomposto })]);
    const resultado = await lerCamadaDeTexto(pagina);

    expect(resultado.palavras[0]!.texto).toBe("questão");
  });

  it("descarta item com `str` vazio ou só espaço", async () => {
    const pagina = paginaFake([item({ str: "" }), item({ str: "   " }), item({ str: "ok" })]);

    const resultado = await lerCamadaDeTexto(pagina);

    expect(resultado.palavras.map((palavra) => palavra.texto)).toEqual(["ok"]);
  });

  it("descarta item sem a forma de `TextItem` — marcação de estrutura não é palavra", async () => {
    // `TextMarkedContent` (quando `includeMarkedContent` está ligado) não tem `str`; o narrowing
    // do adapter tem de ignorá-lo em vez de quebrar.
    const marcacao = { type: "beginMarkedContent", id: "P" };
    const pagina = paginaFake([marcacao, item({ str: "sobrevive" })]);

    const resultado = await lerCamadaDeTexto(pagina);

    expect(resultado.palavras.map((palavra) => palavra.texto)).toEqual(["sobrevive"]);
  });

  it("recusa algo que não é uma página do pdf.js", async () => {
    await expect(lerCamadaDeTexto(null)).rejects.toThrow();
    await expect(lerCamadaDeTexto({})).rejects.toThrow();
  });
});

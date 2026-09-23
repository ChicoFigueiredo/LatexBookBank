import { describe, expect, it } from "vitest";

import type { DocLine } from "@modules/scan/domain/document";
import { captureProfile } from "@modules/scan/domain/profiles";
import { typographicSignature, type PublicationStyle } from "@modules/scan/domain/typography";

/**
 * O que o `book-v1` aprende da tipografia do livro — e o que ele tem de recusar aprender.
 *
 * O aprendizado existe para o caso da §18: depois de ver "2.3 Limites" em corpo de título, o
 * perfil reconhece "Limites" sem número na mesma tipografia. O preço, medido no *Fundamentos de
 * Matemática Elementar*, é que ele varre o livro **inteiro** — e o gabarito do fim do volume é
 * cheio de linhas que parecem título numerado: "2. d", "137. a)", "311. c", em negrito e curtas.
 *
 * Aprendidas essas assinaturas, o ramo tipográfico passava a promover a seção qualquer linha
 * negrito curta de 8 ou 9 pt do livro — inclusive rótulos de eixo de gráfico como "y" e
 * "Distância (m)". Das 453 falsas seções daquele livro, 300 vinham dos dois gabaritos.
 */

const style: PublicationStyle = { bodySize: 10, bodyFont: "FranklinGothic-Book", lineSpacing: 10.8 };

function line(text: string, size: number, bold: boolean, order: number): DocLine {
  return {
    id: `l${order}`,
    pageNumber: 1,
    text,
    spans: [],
    size,
    fontName: bold ? "FranklinGothic-Demi" : "FranklinGothic-Book",
    bold,
    italic: false,
    mathRatio: 0,
    x0: 43,
    y0: order * 20,
    x1: 400,
    y1: order * 20 + size,
    slot: 0,
    order,
  };
}

/** Os títulos de verdade deste livro: numerados e em corpo maior que o texto. */
const titulosReais: readonly DocLine[] = [
  line("CAPITULO I", 28, true, 1),
  line("1. Proposicao e sentenca", 13, true, 2),
  line("2. Negacao de uma proposicao", 13, true, 3),
];

/** O gabarito do fim do volume: numerado, negrito, curto — e **menor** que o corpo do texto. */
const gabarito: readonly DocLine[] = [
  line("2. d", 8, true, 10),
  line("137. a)", 9, true, 11),
  line("311. c", 8, true, 12),
];

describe("o que o book-v1 aprende da tipografia", () => {
  const book = captureProfile("book-v1")!;

  it("aprende a assinatura dos títulos de verdade", () => {
    const learned = book.learnStyle!(titulosReais, style);

    // 13 pt sobre corpo 10 = 1,3× em negrito: é o título numerado deste livro.
    expect(learned.get(typographicSignature(titulosReais[1]!, style))).toBe("SECTION");
  });

  it("não aprende com o gabarito, que é menor que o corpo do texto", () => {
    const learned = book.learnStyle!([...titulosReais, ...gabarito], style);

    // 0,8× e 0,9× em negrito: nenhum livro imprime título em corpo menor que a prosa.
    for (const resposta of gabarito) {
      expect(learned.get(typographicSignature(resposta, style)), resposta.text).toBeUndefined();
    }
    // E o que era legítimo continua aprendido.
    expect(learned.get(typographicSignature(titulosReais[1]!, style))).toBe("SECTION");
  });

  it("gabarito sozinho não ensina nada — nem o nível de título", () => {
    // Sem esta guarda, "2. d" fazia o perfil concluir que este livro numera seções com um número
    // só, e o nível de todos os títulos escorregava junto.
    expect([...book.learnStyle!(gabarito, style).values()]).toEqual([]);
  });
});

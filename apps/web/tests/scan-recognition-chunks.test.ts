import { describe, expect, it } from "vitest";

import { chunkBoxes } from "@modules/scan/domain/recognition-chunks";

/**
 * O reconhecimento em pedaços de poucas linhas (D78): o modelo de 12B errava "3/2 = 6/4" num
 * recorte de página inteira e acertava num de três linhas.
 */

/** Um parágrafo: linhas de 0,012 de altura com 0,004 de entrelinha. */
const paragrafo = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ y0: from + i * 0.016, y1: from + i * 0.016 + 0.012 }));

const region = { x: 0.1, y: 0.1, width: 0.8, height: 0.5 };
const options = { maxHeight: 0.12, minGap: 0.008 };

describe("os pedaços do recorte", () => {
  it("recorte pequeno vai inteiro", () => {
    expect(chunkBoxes({ ...region, height: 0.1 }, paragrafo(0.1, 5), options)).toEqual([{ ...region, height: 0.1 }]);
  });

  it("corta entre parágrafos, nunca no meio de um, e cobre o recorte inteiro", () => {
    // Quatro parágrafos de cinco linhas, separados por 0,03.
    const linhas = [0.1, 0.21, 0.32, 0.43].flatMap((from) => paragrafo(from, 5));
    const pedacos = chunkBoxes(region, linhas, options);

    expect(pedacos.length).toBeGreaterThan(1);
    expect(pedacos[0]!.y).toBe(region.y);
    expect(pedacos.at(-1)!.y + pedacos.at(-1)!.height).toBeCloseTo(region.y + region.height);
    for (const [a, b] of pedacos.slice(1).map((p, i) => [pedacos[i]!, p] as const)) expect(a.y + a.height).toBeCloseTo(b.y);
    // Nenhum corte atravessa uma linha.
    const cortes = pedacos.slice(1).map((p) => p.y);
    for (const corte of cortes) expect(linhas.some((l) => l.y0 < corte && l.y1 > corte)).toBe(false);
  });

  it("parágrafo maior que o pedaço fica inteiro — não há onde cortar sem partir frase", () => {
    expect(chunkBoxes(region, paragrafo(0.1, 30), options)).toHaveLength(1);
  });
});

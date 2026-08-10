import { describe, expect, it } from "vitest";

import { originActions, referenceText, type Provenance } from "@modules/assets/domain/provenance";

/**
 * O que dá para fazer a partir de uma origem — e por que, quando não dá.
 *
 * As opções depois do crop moram no domínio porque cada uma **depende do que a fonte é**. Decidir
 * isso na tela daria botões que falham quando clicados, e um botão que falha ensina a não
 * confiar em nenhum.
 */

const provenance = (over: Partial<Provenance> = {}): Provenance => ({
  anchorId: "anchor-1",
  publicationId: "pub-1",
  pageNumber: 12,
  box: { x: 0.1, y: 0.25, width: 0.5, height: 0.125 },
  rotation: null,
  source: {
    assetId: "asset-1",
    filename: "prova-2019.pdf",
    mimeType: "application/pdf",
    isPdf: true,
  },
  cropAssetId: "crop-1",
  sourceText: null,
  extractionMethod: null,
  extractionModel: null,
  ...over,
});

const by = (id: string, from: Provenance) => originActions(from).find((a) => a.id === id)!;

describe("as opções depois do crop", () => {
  it("com PDF e recorte, tudo está disponível", () => {
    expect(originActions(provenance()).every((action) => action.available)).toBe(true);
  });

  it("fonte que não é PDF não tem página para abrir — e diz isso", () => {
    const image = provenance({
      source: { assetId: "a", filename: "foto.png", mimeType: "image/png", isPdf: false },
    });

    expect(by("open-source", image).available).toBe(false);
    expect(by("open-source", image).unavailableReason).toContain("imagem solta");
  });

  it("recorte descartado desabilita reconhecer e inserir figura", () => {
    // Derivado pode sumir do storage (D29). O que não pode é o botão prometer e falhar.
    const evicted = provenance({ cropAssetId: null });

    expect(by("recognize-math", evicted).available).toBe(false);
    expect(by("insert-figure", evicted).available).toBe(false);
  });

  it("copiar referência sobrevive ao descarte do recorte", () => {
    // A âncora **é** a referência: ela aponta para a fonte, que é imutável (D29).
    expect(by("copy-reference", provenance({ cropAssetId: null })).available).toBe(true);
  });

  it("toda opção indisponível tem motivo — botão desabilitado sem explicação é enigma", () => {
    const worst = provenance({
      cropAssetId: null,
      source: { assetId: "a", filename: null, mimeType: "image/png", isPdf: false },
    });

    for (const action of originActions(worst)) {
      if (!action.available) expect(action.unavailableReason).toBeTruthy();
      else expect(action.unavailableReason).toBeNull();
    }
  });
});

describe("a referência textual", () => {
  it("diz arquivo, página e pedaço — sem id de banco", () => {
    // Quem recebe precisa achar o mesmo pedaço do mesmo arquivo, e um uuid não ajuda nisso.
    const text = referenceText(provenance());

    expect(text).toBe("prova-2019.pdf, p. 12, recorte 10.0%,25.0% 50.0%×12.5%");
    expect(text).not.toContain("anchor-1");
  });

  it("fonte sem nome não vira string vazia no meio da frase", () => {
    expect(
      referenceText(provenance({ source: { ...provenance().source, filename: null } })),
    ).toContain("fonte desconhecida");
  });
});

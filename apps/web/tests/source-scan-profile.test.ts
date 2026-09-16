import { describe, expect, it } from "vitest";

import { bookSourceScanProfile } from "@modules/source-scanning/domain/profiles/book";

describe("book source scan profile", () => {
  it("classifies explicit editorial headings", () => {
    expect(bookSourceScanProfile.classifyHeading({ text: "Capítulo 4 Funções" })?.kind).toBe(
      "CHAPTER",
    );
    expect(bookSourceScanProfile.classifyHeading({ text: "4.2 Função quadrática" })?.kind).toBe(
      "SECTION",
    );
    expect(bookSourceScanProfile.classifyHeading({ text: "Exemplo 7" })?.kind).toBe("EXAMPLE");
    expect(bookSourceScanProfile.classifyHeading({ text: "Exercícios" })?.kind).toBe(
      "EXERCISE_GROUP",
    );
    expect(bookSourceScanProfile.classifyHeading({ text: "Exercício 12" })?.kind).toBe(
      "EXERCISE",
    );
  });

  it("uses typographic evidence conservatively when the text has no marker", () => {
    expect(
      bookSourceScanProfile.classifyHeading({
        text: "Transformações lineares",
        fontSizeRatio: 1.8,
        bold: true,
        centered: false,
      }),
    ).toMatchObject({ kind: "SECTION", confidence: 0.68 });
  });

  it("validates hierarchy without a global switch", () => {
    expect(bookSourceScanProfile.canContain("CHAPTER", "SECTION")).toBe(true);
    expect(bookSourceScanProfile.canContain("SECTION", "EXERCISE")).toBe(true);
    expect(bookSourceScanProfile.canContain("EXERCISE", "SUBITEM")).toBe(true);
    expect(bookSourceScanProfile.canContain("EXERCISE", "CHAPTER")).toBe(false);
  });

  it("tells the semantic pass to preserve cross-page content as one node", () => {
    const prompt = bookSourceScanProfile.buildSemanticPrompt({
      publicationTitle: "Álgebra",
      language: "pt-BR",
      pages: ["página A", "página B"],
    });

    expect(prompt).toContain("múltiplos trechos e múltiplas páginas");
    expect(prompt).toContain("MESMO nó");
    expect(prompt).toContain("LaTeX");
  });
});

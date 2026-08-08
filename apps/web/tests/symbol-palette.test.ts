import { describe, expect, it } from "vitest";

import {
  PALETTE_RENDER_LIMIT,
  matchesSymbolQuery,
  paletteView,
  symbolPreview,
  type SymbolEntry,
} from "@modules/latex-knowledge/domain/symbol-palette";

const entry = (over: Partial<SymbolEntry> = {}): SymbolEntry => ({
  command: "\\alpha",
  groupName: "greek",
  unicode: "α",
  requiredPackage: null,
  mathMode: true,
  ...over,
});

describe("symbolPreview", () => {
  it("prefere a miniatura ao Unicode", () => {
    // `\\leq` tem o Unicode ≤, mas a fonte do sistema desenha diferente do TeX. Uma palette que
    // mostra outra coisa do que o LaTeX vai produzir engana mais do que ajuda.
    expect(symbolPreview(entry(), "<svg/>")).toEqual({ kind: "svg", svg: "<svg/>" });
  });

  it("cai no Unicode quando não há miniatura", () => {
    expect(symbolPreview(entry(), undefined)).toEqual({ kind: "unicode", char: "α" });
  });

  it("cai no próprio comando quando não há nem miniatura nem Unicode", () => {
    // São 62 símbolos assim. Mostrar `\\dagger` ainda é informação; célula vazia não é.
    expect(symbolPreview(entry({ unicode: null }), undefined)).toEqual({
      kind: "command",
      command: "\\alpha",
    });
  });
});

describe("matchesSymbolQuery", () => {
  it("acha pelo comando, sem exigir a barra", () => {
    expect(matchesSymbolQuery(entry(), "alpha")).toBe(true);
    expect(matchesSymbolQuery(entry(), "\\alpha")).toBe(true);
  });

  it("acha pelo pacote — são 205 símbolos de `amssymb`", () => {
    expect(matchesSymbolQuery(entry({ requiredPackage: "amssymb" }), "amssymb")).toBe(true);
  });

  it("acha pelo próprio caractere", () => {
    expect(matchesSymbolQuery(entry(), "α")).toBe(true);
  });

  it("casa todos os termos, em qualquer ordem", () => {
    const arrow = entry({ command: "\\leftarrow", requiredPackage: "amssymb", unicode: "←" });

    expect(matchesSymbolQuery(arrow, "arrow amssymb")).toBe(true);
    expect(matchesSymbolQuery(arrow, "amssymb arrow")).toBe(true);
    expect(matchesSymbolQuery(arrow, "arrow wasysym")).toBe(false);
  });

  it("ignora acento e caixa", () => {
    expect(matchesSymbolQuery(entry({ command: "\\Alpha" }), "alpha")).toBe(true);
  });

  it("busca vazia não filtra nada", () => {
    expect(matchesSymbolQuery(entry(), "   ")).toBe(true);
  });
});

describe("paletteView", () => {
  const greek = entry({ command: "\\alpha", groupName: "greek" });
  const arrows = entry({ command: "\\leftarrow", groupName: "arrows", unicode: "←" });

  it("sem busca, mostra só o grupo escolhido", () => {
    expect(paletteView([greek, arrows], "greek", "").visible).toEqual([greek]);
  });

  it("com busca, atravessa os grupos", () => {
    // Quem procura `alpha` não sabe que ele mora em `greek`. Obrigar a acertar o grupo antes de
    // buscar seria esconder o acervo do próprio dono.
    const view = paletteView([greek, arrows], "arrows", "alpha");

    expect(view.visible).toEqual([greek]);
    expect(view.matched).toBe(1);
  });

  it("sem grupo escolhido, considera tudo", () => {
    expect(paletteView([greek, arrows], null, "").matched).toBe(2);
  });

  it("corta a renderização e conta o que ficou de fora", () => {
    // `fontawesome5` sozinho tem 1.566 símbolos; mandar tudo para o DOM trava a rolagem.
    const muitos = Array.from({ length: PALETTE_RENDER_LIMIT + 50 }, (_, index) =>
      entry({ command: `\\sym${index}`, groupName: "fontawesome5" }),
    );
    const view = paletteView(muitos, "fontawesome5", "");

    expect(view.visible).toHaveLength(PALETTE_RENDER_LIMIT);
    expect(view.matched).toBe(PALETTE_RENDER_LIMIT + 50);
    // O corte é informação: sem ele, uma lista truncada em silêncio faz parecer que o símbolo
    // procurado não existe.
    expect(view.truncated).toBe(true);
  });

  it("não marca corte quando cabe tudo", () => {
    expect(paletteView([greek, arrows], null, "").truncated).toBe(false);
  });
});

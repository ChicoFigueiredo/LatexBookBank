import { describe, expect, it } from "vitest";

import { replaceStartColumn } from "@modules/latex-knowledge/domain/completion-range";

/**
 * O intervalo que a sugestão substitui.
 *
 * É o detalhe que só aparece digitando: a definição de "palavra" do Monaco não inclui `\`, então
 * o intervalo padrão cobriria `alp` e deixaria a barra digitada para trás. Aceitar `\alp` gravaria
 * **`\\alpha`** — barra do usuário mais barra do item. Um teste de unidade sobre o provider
 * inteiro não pegaria isso; sobre esta função, pega.
 *
 * Colunas do Monaco são 1-based: `\alp` no começo da linha deixa o cursor na coluna 5.
 */
describe("replaceStartColumn", () => {
  it("começa na barra quando há um comando sendo digitado", () => {
    // `\alp` ocupa as colunas 1..4; o cursor está na 5 e o intervalo tem de começar na 1.
    expect(replaceStartColumn("\\alp", 5, 2)).toBe(1);
  });

  it("acha o comando no meio da linha, não só no começo", () => {
    // "Seja \al" — a barra está na coluna 6, cursor na 9.
    expect(replaceStartColumn("Seja \\al", 9, 7)).toBe(6);
  });

  it("cobre a barra sozinha, recém-digitada", () => {
    expect(replaceStartColumn("\\", 2, 2)).toBe(1);
  });

  it("cai no intervalo da palavra quando não há barra — o caso do `Ctrl+Space`", () => {
    expect(replaceStartColumn("alp", 4, 1)).toBe(1);
    expect(replaceStartColumn("Seja alp", 9, 6)).toBe(6);
  });

  it("não atravessa a barra de um comando já fechado", () => {
    // `\alpha ` seguido de espaço: o que está antes do cursor não é mais um comando aberto.
    expect(replaceStartColumn("\\alpha ", 8, 8)).toBe(8);
  });

  it("ignora dígitos, que não fazem parte de nome de comando em LaTeX", () => {
    // `\x2` — o `2` encerra o nome, então não há comando aberto imediatamente antes do cursor.
    expect(replaceStartColumn("\\x2", 4, 4)).toBe(4);
  });
});

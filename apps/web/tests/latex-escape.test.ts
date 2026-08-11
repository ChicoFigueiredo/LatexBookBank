import { describe, expect, it } from "vitest";

import { escapeIfProse, escapeLatexText } from "@modules/recognition/domain/latex-escape";

/**
 * Prosa lida de um recorte, entrando num documento LaTeX (#193).
 *
 * Reconhecer texto é diferente de reconhecer fórmula: a fórmula já vem em LaTeX, e a prosa vem como
 * está no papel. Os dez caracteres reservados, colados num `.tex`, mudam o significado em vez de
 * aparecer — e o `%` é o pior deles, porque comenta o resto da linha.
 *
 * Uma questão de matemática financeira lida de um scan viraria "Um capital rende 2" no PDF. Sem
 * erro, sem aviso, com o documento saindo bonito e errado. A Fase 5 já tinha registrado o mesmo
 * risco do outro lado.
 */

describe("escapar prosa", () => {
  it("**o `%` não come o resto da linha** — é o caso que custa caro", () => {
    const lido = "Um capital rende 2% ao mês. Qual o montante?";

    expect(escapeLatexText(lido)).toBe("Um capital rende 2\\% ao mês. Qual o montante?");
  });

  it("cifrão vira cifrão, e não abre modo matemático", () => {
    // `$` ímpar abre o modo matemático e o deixa aberto: metade do documento sai em itálico, e o
    // erro aparece longe de onde nasceu.
    expect(escapeLatexText("Custa R$ 1.000,00")).toBe("Custa R\\$ 1.000,00");
  });

  it("os dez reservados saem escapados", () => {
    const saida = escapeLatexText("% $ & # _ { } ~ ^ \\");

    for (const proibido of ["%", "$", "&", "#", "_"]) {
      expect(saida).toContain(`\\${proibido}`);
    }
    expect(saida).toContain("\\textasciitilde{}");
    expect(saida).toContain("\\textasciicircum{}");
    expect(saida).toContain("\\textbackslash{}");
  });

  it("**a barra é escapada primeiro** — senão ela escaparia as dos outros", () => {
    // Se `%` fosse trocado antes, a barra recém-inserida viraria `\textbackslash{}%`, e o texto
    // sairia com a marcação à mostra em vez do sinal de porcentagem.
    expect(escapeLatexText("50%")).toBe("50\\%");
    expect(escapeLatexText("a\\b")).toBe("a\\textbackslash{}b");
  });

  it("acento e pontuação passam intactos — o acervo é em português", () => {
    const texto = "Não é possível, segundo a razão: “três” — 1º lugar.";

    expect(escapeLatexText(texto)).toBe(texto);
  });

  it("texto sem reservado sai idêntico", () => {
    expect(escapeLatexText("Calcule o montante após 6 meses.")).toBe(
      "Calcule o montante após 6 meses.",
    );
  });
});

describe("só o modo `text` escapa", () => {
  it("`display` passa intacto — ele já é LaTeX", () => {
    // Escapar aqui transformaria a fórmula em texto literal, que é o oposto do que se pediu ao
    // modelo. É a razão de a decisão morar numa função e não no chamador.
    expect(escapeIfProse("\\frac{1}{2}", "display")).toBe("\\frac{1}{2}");
  });

  it("`mixed` também — ele traz fórmula entre `$` de propósito", () => {
    expect(escapeIfProse("seja $x=2$, calcule", "mixed")).toBe("seja $x=2$, calcule");
  });

  it("`text` escapa", () => {
    expect(escapeIfProse("2% ao mês", "text")).toBe("2\\% ao mês");
  });
});

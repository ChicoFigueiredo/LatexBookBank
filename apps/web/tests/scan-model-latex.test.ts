import { describe, expect, it } from "vitest";

import { escapeLatexText } from "@modules/latex/domain/latex-escape";
import { modelLatex } from "@modules/scan/domain/approval-latex";

/**
 * O LaTeX do modelo, consertado na aprovação (D78).
 *
 * A compilação do vol. 1 inteiro (1.120 documentos) falhava em 83, e 71 eram "Missing $ inserted":
 * o modelo escreve a linha de conta sem delimitador e o "R$" do dinheiro sem escape. O conserto é
 * na aprovação, e não no reconhecimento, para valer também para o que já foi reconhecido.
 */
describe("o LaTeX do modelo", () => {
  it("a linha de conta sem delimitador vai para \\[ \\] (vol. 1, p. 116: S = {x ∈ ℝ | …})", () => {
    expect(modelLatex("Como a inequação é $f(x) \\geq 0$, vem:\n\nS = \\{x \\in \\mathbb{R} | -\\frac{1}{2} \\leq x \\leq 2\\}")).toBe(
      "Como a inequação é $f(x) \\geq 0$, vem:\n\n\\[ S = \\{x \\in \\mathbb{R} | -\\frac{1}{2} \\leq x \\leq 2\\} \\]",
    );
  });

  it("e o sistema em cases também, com o \\text de dentro (questão 294)", () => {
    const funcao = "T(t) = \\begin{cases}\n\\frac{1}{5}t + 20, \\text{ para } 0 \\leq t < 100 \\\\\nt^2, \\text{ para } t \\geq 100\n\\end{cases}";
    expect(modelLatex(`de acordo com a função\n\n${funcao}`)).toBe(`de acordo com a função\n\n\\[ ${funcao} \\]`);
  });

  it("dois sistemas no mesmo parágrafo também (questão 553): o nome do ambiente não é palavra", () => {
    const sistemas = "\\begin{cases}\nx^2 - 3x \\geq 0\n\\end{cases}\n\\Rightarrow\n\\begin{cases}\nx \\leq 0 \\text{ ou } x \\geq 3\n\\end{cases}";
    expect(modelLatex(sistemas)).toBe(`\\[ ${sistemas} \\]`);
  });

  it("o array solto é conta, com a linha horizontal dentro (questão 403)", () => {
    const tabela = "\\begin{array}{|c|c|} \\hline\nx & y^2 \\\\ \\hline\n\\end{array}";
    expect(modelLatex(tabela)).toBe(`\\[ ${tabela} \\]`);
  });

  it("o $ sem par: fecha no fim, ou sai quando é ele que sobra (questão 39, subseção 53)", () => {
    expect(modelLatex("Prove que $(A - B) \\subset A, \\forall A.")).toBe("Prove que $(A - B) \\subset A, \\forall A.$");
    expect(modelLatex("$x \\leq 2$ é intervalo fechado à direita.$")).toBe("$x \\leq 2$ é intervalo fechado à direita.");
    expect(modelLatex("custa R\\$ 5,00 e $x = 2$")).toBe("custa R\\$ 5,00 e $x = 2$");
  });

  it("o rótulo em negrito fica fora da conta", () => {
    expect(modelLatex("\\textbf{Resolução.} |2x - 3| = \\begin{cases} 2x - 3 \\end{cases}")).toBe(
      "\\textbf{Resolução.} \\[ |2x - 3| = \\begin{cases} 2x - 3 \\end{cases} \\]",
    );
  });

  it("frase com conta solta não vira conta: fica como está", () => {
    const frase = "Raciocínio análogo seria feito para a inequação com x^2 no lugar de x, e o resultado seria parecido.";
    expect(modelLatex(frase)).toBe(frase);
  });

  it("o que já tem delimitador, tabela ou lista não é tocado", () => {
    for (const bloco of ["$x^2 = 4$", "\\begin{tabular}{cc} x & y^2 \\end{tabular}", "\\begin{itemize}\n\\item $x^2$\n\\end{itemize}"]) {
      expect(modelLatex(bloco)).toBe(bloco);
    }
  });

  it("o R$ do dinheiro vira R\\$ (questão 238: R$ 700,00)", () => {
    expect(modelLatex("o custo de R$ 700,00 corresponde a $x$ litros")).toBe("o custo de R\\$ 700,00 corresponde a $x$ litros");
    expect(modelLatex("custa R\\$ 5,00")).toBe("custa R\\$ 5,00");
  });
});

describe("o texto da camada do PDF, em LaTeX", () => {
  it("leva √, ⋅, ⊥ e as letras gregas para a matemática — o pdflatex não os aceita no texto", () => {
    expect(escapeLatexText("√3 ⋅ 2 ⊥ ζ α")).toBe("$\\surd$3 $\\cdot$ 2 $\\perp$ $\\zeta$ $\\alpha$");
  });
});

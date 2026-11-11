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
    expect(
      modelLatex(
        "Como a inequação é $f(x) \\geq 0$, vem:\n\nS = \\{x \\in \\mathbb{R} | -\\frac{1}{2} \\leq x \\leq 2\\}",
      ),
    ).toBe(
      "Como a inequação é $f(x) \\geq 0$, vem:\n\n\\[ S = \\{x \\in \\mathbb{R} | -\\frac{1}{2} \\leq x \\leq 2\\} \\]",
    );
  });

  it("e o sistema em cases também, com o \\text de dentro (questão 294)", () => {
    const funcao =
      "T(t) = \\begin{cases}\n\\frac{1}{5}t + 20, \\text{ para } 0 \\leq t < 100 \\\\\nt^2, \\text{ para } t \\geq 100\n\\end{cases}";
    expect(modelLatex(`de acordo com a função\n\n${funcao}`)).toBe(
      `de acordo com a função\n\n\\[ ${funcao} \\]`,
    );
  });

  it("dois sistemas no mesmo parágrafo também (questão 553): o nome do ambiente não é palavra", () => {
    const sistemas =
      "\\begin{cases}\nx^2 - 3x \\geq 0\n\\end{cases}\n\\Rightarrow\n\\begin{cases}\nx \\leq 0 \\text{ ou } x \\geq 3\n\\end{cases}";
    expect(modelLatex(sistemas)).toBe(`\\[ ${sistemas} \\]`);
  });

  it("o array solto é conta, com a linha horizontal dentro (questão 403)", () => {
    const tabela = "\\begin{array}{|c|c|} \\hline\nx & y^2 \\\\ \\hline\n\\end{array}";
    expect(modelLatex(tabela)).toBe(`\\[ ${tabela} \\]`);
  });

  it("o $ sem par: fecha no fim, ou sai quando é ele que sobra (questão 39, subseção 53)", () => {
    expect(modelLatex("Prove que $(A - B) \\subset A, \\forall A.")).toBe(
      "Prove que $(A - B) \\subset A, \\forall A.$",
    );
    expect(modelLatex("$x \\leq 2$ é intervalo fechado à direita.$")).toBe(
      "$x \\leq 2$ é intervalo fechado à direita.",
    );
    expect(modelLatex("custa R\\$ 5,00 e $x = 2$")).toBe("custa R\\$ 5,00 e $x = 2$");
  });

  it("a palavra acentuada dentro da conta vai para \\text, e o º vira grau (vol. 7)", () => {
    // "Command \' invalid in math mode": o pdflatex não aceita "á" em modo matemático.
    expect(modelLatex("Temos $área = b \\cdot h$ e $\\text{área} > 0$.")).toBe(
      "Temos $\\text{área} = b \\cdot h$ e $\\text{área} > 0$.",
    );
    expect(modelLatex("o $1º$ caso")).toBe("o $1^{\\circ}$ caso");
  });

  it("o rótulo em negrito fica fora da conta", () => {
    expect(modelLatex("\\textbf{Resolução.} |2x - 3| = \\begin{cases} 2x - 3 \\end{cases}")).toBe(
      "\\textbf{Resolução.} \\[ |2x - 3| = \\begin{cases} 2x - 3 \\end{cases} \\]",
    );
  });

  it("frase com conta solta não vira conta: fica como está", () => {
    const frase =
      "Raciocínio análogo seria feito para a inequação com x^2 no lugar de x, e o resultado seria parecido.";
    expect(modelLatex(frase)).toBe(frase);
  });

  it("o que já tem delimitador, tabela ou lista não é tocado", () => {
    for (const bloco of [
      "$x^2 = 4$",
      "\\begin{tabular}{cc} x & y^2 \\end{tabular}",
      "\\begin{itemize}\n\\item $x^2$\n\\end{itemize}",
    ]) {
      expect(modelLatex(bloco)).toBe(bloco);
    }
  });

  it("o R$ do dinheiro vira R\\$ (questão 238: R$ 700,00)", () => {
    expect(modelLatex("o custo de R$ 700,00 corresponde a $x$ litros")).toBe(
      "o custo de R\\$ 700,00 corresponde a $x$ litros",
    );
    expect(modelLatex("custa R\\$ 5,00")).toBe("custa R\\$ 5,00");
  });
});

describe("o circunflexo combinado do ângulo (AB̂C, vol. 7)", () => {
  it("vira \\hat, dentro e fora da conta", () => {
    expect(modelLatex("o ângulo $AB̂C$ e o ângulo AB̂C")).toBe(
      "o ângulo $A\\hat{B}C$ e o ângulo A$\\hat{B}$C",
    );
    expect(escapeLatexText("ângulo AB̂C")).toBe("ângulo A$\\hat{B}$C");
  });
});

describe("o que o vol. 5 trouxe", () => {
  it("o \\choose vira \\binom, e o # solto ganha escape", () => {
    expect(modelLatex("$\\displaystyle {n \\choose p} = {n \\choose n-p}$")).toBe(
      "$\\displaystyle \\binom{n}{p} = \\binom{n}{n-p}$",
    );
    expect(modelLatex("o número $#A = 3$ e o \\# certo")).toBe("o número $\\#A = 3$ e o \\# certo");
  });

  it("o ∙ e o ▲ do vol. 11 também", () => {
    expect(escapeLatexText("2 ∙ 3 ▲")).toBe("2 $\\cdot$ 3 $\\blacktriangle$");
  });

  it("⩾, ⩽ e ≅ vão à matemática", () => {
    expect(escapeLatexText("x ⩾ 2, y ⩽ 3, ABC ≅ DEF")).toBe(
      "x $\\geqslant$ 2, y $\\leqslant$ 3, ABC $\\cong$ DEF",
    );
  });
});

describe("índice e expoente em Unicode (vol. 2: log₃)", () => {
  it("vão à matemática como _{…} e ^{…}; o ² e o ³ do texto ficam", () => {
    expect(escapeLatexText("log₃ 9 e xₐ e 10⁺ e ◊")).toBe(
      "log$_{3}$ 9 e x$_{a}$ e 10$^{+}$ e $\\lozenge$",
    );
    expect(escapeLatexText("área em m² e cm³")).toBe("área em m² e cm³");
  });
});

describe("o texto da camada do PDF, em LaTeX", () => {
  it("leva √, ⋅, ⊥ e as letras gregas para a matemática — o pdflatex não os aceita no texto", () => {
    expect(escapeLatexText("√3 ⋅ 2 ⊥ ζ α")).toBe(
      "$\\surd$3 $\\cdot$ 2 $\\perp$ $\\zeta$ $\\alpha$",
    );
  });
});

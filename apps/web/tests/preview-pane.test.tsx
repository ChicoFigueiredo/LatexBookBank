// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PREVIEW_DISCLAIMER } from "@modules/preview/domain/preview-model";
import { PreviewPane } from "@modules/preview/ui/PreviewPane";

/**
 * O preview inteiro, do LaTeX ao que aparece na tela.
 *
 * Sem `globals: true` no Vitest, a limpeza automática do Testing Library não se registra — dois
 * `render` seguidos deixariam dois previews no documento e toda consulta viraria ambígua.
 */
afterEach(cleanup);

const source = {
  statementLatex: "",
  solutionLatex: "",
  complementLatex: "",
  options: [] as { statementLatex: string; isCorrect: boolean }[],
};

describe("PreviewPane", () => {
  it("mostra o aviso da §11, e mostra sempre", () => {
    render(<PreviewPane source={source} />);
    expect(screen.getByText(PREVIEW_DISCLAIMER)).toBeTruthy();
  });

  it("explica o que fazer quando não há nada escrito", () => {
    // Empty state que diz a próxima ação, não um painel em branco (checklist visual §34).
    render(<PreviewPane source={source} />);
    expect(screen.getByText(/aparece aqui conforme você escreve/i)).toBeTruthy();
  });

  it("renderiza parágrafo e matemática inline", () => {
    render(<PreviewPane source={{ ...source, statementLatex: "Seja $x^2$ o valor." }} />);

    // A fórmula é uma máscara, não texto — o rótulo acessível é o que a nomeia.
    const math = screen.getByRole("math");
    expect(math.getAttribute("aria-label")).toBe("x^2");
    expect(screen.getByText(/Seja/)).toBeTruthy();
  });

  it("a fórmula entra como máscara CSS, nunca como HTML injetado", () => {
    // É a propriedade que substitui o sanitizer: uma máscara é imagem, e imagem não executa
    // script. Se algum dia isto virar `dangerouslySetInnerHTML`, este teste cai.
    const { container } = render(<PreviewPane source={{ ...source, statementLatex: "$a+b$" }} />);

    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByRole("math").getAttribute("style")).toContain(
      '--lbb-math-src: url("data:image/svg+xml,',
    );
  });

  it("a regra que consome a variável está no documento", () => {
    render(<PreviewPane source={{ ...source, statementLatex: "$a+b$" }} />);
    const css = document.getElementById("lbb-math-css")?.textContent ?? "";

    expect(css).toContain("mask-image:var(--lbb-math-src)");
    expect(css).toContain("background-color:currentColor");
  });

  it("dá tamanho e linha de base à fórmula, em `ex`", () => {
    // Sem isto a fração flutuaria acima da linha e o parágrafo pareceria ter alturas diferentes.
    render(<PreviewPane source={{ ...source, statementLatex: "$\\frac{1}{2}$" }} />);
    const style = screen.getByRole("math").getAttribute("style") ?? "";

    expect(style).toMatch(/width:\s*[\d.]+ex/);
    expect(style).toMatch(/vertical-align:\s*-[\d.]+ex/);
  });

  it("numera as alternativas e marca o gabarito", () => {
    render(
      <PreviewPane
        source={{
          ...source,
          statementLatex: "Assinale:",
          options: [
            { statementLatex: "primeira", isCorrect: false },
            { statementLatex: "segunda", isCorrect: true },
          ],
        }}
      />,
    );

    const items = screen.getAllByRole("listitem");
    expect(within(items[0]!).getByText("a)")).toBeTruthy();
    expect(within(items[1]!).getByText("b)")).toBeTruthy();
  });

  it("mostra resposta e complemento em seções próprias", () => {
    render(
      <PreviewPane
        source={{ ...source, solutionLatex: "porque sim", complementLatex: "veja também" }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Resposta" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Complemento" })).toBeTruthy();
  });

  it("omite a seção vazia em vez de deixar um título órfão", () => {
    render(<PreviewPane source={{ ...source, statementLatex: "só o enunciado" }} />);
    expect(screen.queryByRole("heading", { name: "Resposta" })).toBeNull();
  });

  it("fórmula quebrada não derruba o preview — o MathJax desenha o próprio erro", () => {
    // Descoberto escrevendo o teste: eu esperava cair no texto cru, mas o MathJax não lança —
    // ele produz uma caixa de erro visível, que é informação melhor do que o LaTeX de volta.
    // O caminho do texto cru continua existindo, para quando nem isso sair.
    render(<PreviewPane source={{ ...source, statementLatex: "$\\frac{$" }} />);

    expect(screen.getByRole("math").getAttribute("aria-label")).toBe("\\frac{");
  });

  it("renderiza lista de marcadores como lista de verdade", () => {
    const { container } = render(
      <PreviewPane
        source={{
          ...source,
          statementLatex: "\\begin{itemize}\\item um\\item dois\\end{itemize}",
        }}
      />,
    );

    const list = container.querySelector("ul");
    expect(list?.querySelectorAll("li")).toHaveLength(2);
  });

  it("mostra a moldura da figura com o nome do arquivo", () => {
    // Os arquivos do acervo só viram Asset na Fase 11. Sumir com a figura em silêncio faria o
    // preview parecer completo quando não está.
    render(<PreviewPane source={{ ...source, statementLatex: "\\includegraphics{g.png}" }} />);
    expect(screen.getByText(/figura: g\.png/)).toBeTruthy();
  });
});

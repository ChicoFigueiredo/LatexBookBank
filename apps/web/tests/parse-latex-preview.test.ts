import { describe, expect, it } from "vitest";

import {
  parseInlines,
  parseLatexPreview,
  stripComments,
} from "@modules/preview/domain/parse-latex-preview";
import type { PreviewBlock, PreviewInline } from "@modules/preview/domain/preview-model";

/** Texto corrido de um bloco, para asserções que não são sobre a estrutura. */
function textOf(node: PreviewBlock | PreviewInline): string {
  switch (node.kind) {
    case "text":
      return node.text;
    case "math":
      return `⟨${node.latex}⟩`;
    case "break":
      return "\n";
    case "styled":
      return node.inlines.map(textOf).join("");
    case "paragraph":
      return node.inlines.map(textOf).join("");
    case "displayMath":
      return `⟦${node.latex}⟧`;
    case "list":
      return node.items.map((item) => item.blocks.map(textOf).join("")).join(" | ");
    case "image":
      return `[${node.path}]`;
    case "box":
      return node.blocks.map(textOf).join("");
  }
}

const render = (source: string): string => parseLatexPreview(source).map(textOf).join("\n");

describe("stripComments", () => {
  it("tira o comentário mas preserva a quebra de linha", () => {
    // Comer a linha inteira colaria dois parágrafos que o autor separou de propósito.
    expect(stripComments("um % nota\n\ndois")).toBe("um \n\ndois");
  });

  it("não confunde `\\%` com comentário", () => {
    // O acervo é de matemática: metade das questões de porcentagem sumiria.
    expect(stripComments("taxa de 15\\% ao ano")).toBe("taxa de 15\\% ao ano");
  });
});

describe("parágrafos", () => {
  it("linha em branco separa; quebra simples não", () => {
    const blocks = parseLatexPreview("Primeiro\nainda o primeiro\n\nSegundo");

    expect(blocks).toHaveLength(2);
    expect(textOf(blocks[0]!)).toBe("Primeiro ainda o primeiro");
    expect(textOf(blocks[1]!)).toBe("Segundo");
  });

  it("`\\\\` é quebra de linha dentro do mesmo parágrafo", () => {
    const blocks = parseLatexPreview("uma\\\\outra");

    expect(blocks).toHaveLength(1);
    expect(textOf(blocks[0]!)).toBe("uma\noutra");
  });

  it("não devolve parágrafo vazio para espaço em branco", () => {
    expect(parseLatexPreview("   \n\n  \n\n ")).toEqual([]);
  });
});

describe("matemática", () => {
  it("`$…$` é inline", () => {
    expect(render("Seja $x^2$ o valor")).toBe("Seja ⟨x^2⟩ o valor");
  });

  it("`\\(…\\)` também", () => {
    expect(render("Seja \\(x^2\\) o valor")).toBe("Seja ⟨x^2⟩ o valor");
  });

  it("`$$…$$` é display, e vira bloco próprio", () => {
    const blocks = parseLatexPreview("Antes $$\\int_0^1 x\\,dx$$ depois");

    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "displayMath", "paragraph"]);
    expect(textOf(blocks[1]!)).toBe("⟦\\int_0^1 x\\,dx⟧");
  });

  it("`\\[…\\]` também", () => {
    expect(render("\\[a+b\\]")).toBe("⟦a+b⟧");
  });

  it("`equation` vira display", () => {
    expect(render("\\begin{equation}E=mc^2\\end{equation}")).toBe("⟦E=mc^2⟧");
  });

  it("`align*` também — o asterisco faz parte do nome", () => {
    expect(render("\\begin{align*}x&=1\\end{align*}")).toBe("⟦x&=1⟧");
  });

  it("`$` sem fechamento não engole o resto — quem digita ainda está no meio", () => {
    expect(render("preço $ 10 reais")).toContain("preço");
  });
});

describe("marcadores", () => {
  it("`itemize` vira lista não numerada", () => {
    const blocks = parseLatexPreview("\\begin{itemize}\\item um\\item dois\\end{itemize}");

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "list", ordered: false });
    expect(textOf(blocks[0]!)).toBe("um | dois");
  });

  it("`enumerate` vira numerada", () => {
    expect(parseLatexPreview("\\begin{enumerate}\\item um\\end{enumerate}")[0]).toMatchObject({
      ordered: true,
    });
  });

  it("lista aninhada não vira item do pai", () => {
    // Sem contar `\\begin`/`\\end`, o `\\item` de dentro quebraria o item de fora em dois.
    const blocks = parseLatexPreview(
      "\\begin{itemize}\\item externo\\begin{itemize}\\item interno\\end{itemize}\\end{itemize}",
    );
    const list = blocks[0];

    expect(list?.kind).toBe("list");
    expect(list?.kind === "list" && list.items).toHaveLength(1);
  });

  it("`\\item[rótulo]` do `description` mantém o rótulo no texto", () => {
    expect(render("\\begin{description}\\item[Nota] importante\\end{description}")).toBe(
      "Nota importante",
    );
  });
});

describe("imagens", () => {
  it("`\\includegraphics` vira bloco com o caminho", () => {
    expect(parseLatexPreview("\\includegraphics{figura.png}")[0]).toEqual({
      kind: "image",
      path: "figura.png",
      widthFraction: null,
    });
  });

  it("largura relativa vira fração", () => {
    expect(parseLatexPreview("\\includegraphics[width=0.5\\textwidth]{f.png}")[0]).toMatchObject({
      widthFraction: 0.5,
    });
  });

  it("largura absoluta não vira fração — o preview não sabe a largura da página", () => {
    expect(parseLatexPreview("\\includegraphics[width=5cm]{f.png}")[0]).toMatchObject({
      widthFraction: null,
    });
  });
});

describe("caixas", () => {
  it("`tcolorbox` vira caixa com os blocos de dentro", () => {
    const blocks = parseLatexPreview("\\begin{tcolorbox}Atenção\\end{tcolorbox}");

    expect(blocks[0]?.kind).toBe("box");
    expect(textOf(blocks[0]!)).toBe("Atenção");
  });

  it("descarta as opções do `tcolorbox`", () => {
    expect(render("\\begin{tcolorbox}[colback=red]Aviso\\end{tcolorbox}")).toBe("Aviso");
  });
});

describe("ênfase", () => {
  it("reconhece negrito, itálico e sublinhado", () => {
    const inlines = parseInlines("\\textbf{a}\\emph{b}\\underline{c}");

    expect(inlines.map((i) => (i.kind === "styled" ? i.style : i.kind))).toEqual([
      "bold",
      "italic",
      "underline",
    ]);
  });

  it("mantém matemática dentro da ênfase", () => {
    const [styled] = parseInlines("\\textbf{vale $x$}");

    expect(styled?.kind).toBe("styled");
    expect(styled?.kind === "styled" && styled.inlines.some((i) => i.kind === "math")).toBe(true);
  });
});

describe("degradação: comando desconhecido some, argumento fica", () => {
  it("mantém o argumento de um comando que o modelo não conhece", () => {
    // `\\xlop` é do acervo real e o preview não faz ideia do que seja. Travar aqui seria pior.
    expect(render("resultado \\xlop{1234}")).toBe("resultado 1234");
  });

  it("descarta o argumento opcional e mantém o obrigatório", () => {
    expect(render("\\colorbox[rgb]{texto}")).toBe("texto");
  });

  it("comando sem argumento vira espaço, não cola nas palavras vizinhas", () => {
    expect(render("antes \\LaTeX depois")).toBe("antes depois");
  });

  it("ambiente desconhecido desembrulha", () => {
    expect(render("\\begin{center}centrado\\end{center}")).toBe("centrado");
  });

  it("`\\begin` sem `\\end` mostra o que já foi escrito", () => {
    // Acontece o tempo todo enquanto se digita; esconder tudo faria o preview piscar em branco.
    expect(render("\\begin{itemize}\\item parcial")).toBe("parcial");
  });

  it("escapes viram o caractere literal", () => {
    expect(render("30\\% de \\$5 \\& mais")).toBe("30% de $5 & mais");
  });

  it("`~` vira espaço inquebrável, não espaço comum", () => {
    // É a única coisa que o autor pediu ao escrever o til: que o "1" não caia sozinho na
    // linha seguinte. Um espaço comum perderia exatamente isso.
    expect(render("Figura~1")).toBe("Figura 1");
  });
});

describe("um trecho parecido com o acervo", () => {
  it("junta enunciado, matemática, lista e figura", () => {
    const blocks = parseLatexPreview(`
Considere a função $f(x) = x^2 - 4$. % definida nos reais

\\[f'(x) = 2x\\]

Assinale:
\\begin{enumerate}
  \\item $f$ é crescente em $\\mathbb{R}$
  \\item $f$ tem raiz em $x = 2$
\\end{enumerate}

\\includegraphics[width=0.6\\textwidth]{grafico.png}
`);

    expect(blocks.map((b) => b.kind)).toEqual([
      "paragraph",
      "displayMath",
      "paragraph",
      "list",
      "image",
    ]);
    expect(textOf(blocks[0]!)).toBe("Considere a função ⟨f(x) = x^2 - 4⟩.");
  });
});

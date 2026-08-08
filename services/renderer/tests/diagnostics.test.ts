import { describe, expect, it } from "vitest";

import { hasErrors, parseLatexLog } from "../src/diagnostics.ts";

/**
 * A tradução do log.
 *
 * O material é recortado de logs reais do `pdflatex` desta máquina, não inventado — o formato do
 * log muda entre distribuições, e um teste sobre um formato imaginado passaria enquanto o produto
 * mostra a aba de log vazia.
 */

describe("parseLatexLog", () => {
  it("lê erro no formato `arquivo:linha:` do `-file-line-error`", () => {
    const [erro] = parseLatexLog("./main.tex:4: Undefined control sequence.");

    expect(erro).toMatchObject({ severity: "error", line: 4, file: "main.tex" });
    expect(erro?.message).toBe("Undefined control sequence.");
  });

  it("não repete o erro quando vem o resumo `Fatal error occurred`", () => {
    // O `pdflatex` emite o resumo no mesmo formato do erro. Sem a exceção, toda falha apareceria
    // duas vezes: uma com a causa, outra dizendo que houve uma causa.
    const log = [
      "./main.tex:4: Undefined control sequence.",
      "l.4 \\comandoQueNaoExiste",
      "/tmp/lbb-render-abc/main.tex:4:  ==> Fatal error occurred, no output PDF file produced!",
    ].join("\n");

    expect(parseLatexLog(log).filter((d) => d.severity === "error")).toHaveLength(1);
  });

  it("não vaza o caminho do diretório temporário", () => {
    // O caminho completo conta como o worker organiza o disco e não ajuda ninguém a corrigir
    // LaTeX.
    const [erro] = parseLatexLog("/tmp/lbb-render-abc/main.tex:9: Missing $ inserted.");
    expect(erro?.file).toBe("main.tex");
  });

  it("lê o formato clássico, com a linha algumas linhas abaixo", () => {
    const log = ["! Undefined control sequence.", "<recently read> \\naoexiste", "", "l.12"].join(
      "\n",
    );
    const [erro] = parseLatexLog(log);

    expect(erro).toMatchObject({ severity: "error", line: 12 });
  });

  it("tira o prefixo `LaTeX Error:` da mensagem", () => {
    const [erro] = parseLatexLog("./main.tex:3: LaTeX Error: File `xyz.sty' not found.");
    expect(erro?.message).toBe("File `xyz.sty' not found.");
  });

  it("aviso do LaTeX vira `warning`, com a linha de entrada", () => {
    const [aviso] = parseLatexLog("LaTeX Warning: Reference `eq:1' undefined on input line 42.");

    expect(aviso).toMatchObject({ severity: "warning", line: 42 });
  });

  it("junta a continuação de um aviso quebrado em duas linhas", () => {
    const log = [
      "Package hyperref Warning: Token not allowed in a PDF string (Unicode):",
      "(hyperref)                removing `\\textbf'.",
    ].join("\n");
    const [aviso] = parseLatexLog(log);

    expect(aviso?.message).toContain("removing");
  });

  it("`Overfull \\hbox` é `info`, não `warning`", () => {
    // Aparece em quase todo documento com uma linha um pouco larga. Como aviso, encheria o painel
    // de amarelo até ninguém mais olhar — que é o mesmo que não ter aviso.
    const [caixa] = parseLatexLog("Overfull \\hbox (12.5pt too wide) in paragraph at lines 8--9");

    expect(caixa).toMatchObject({ severity: "info", line: 8 });
  });

  it("não inventa diagnóstico para linha que não reconhece", () => {
    // Tradução, não interpretação: o que não casa fica no log cru, que vai inteiro para a aba.
    const log = [
      "This is pdfTeX, Version 3.141592653",
      "(./main.tex",
      "Output written on main.pdf",
    ].join("\n");
    expect(parseLatexLog(log)).toEqual([]);
  });
});

describe("hasErrors", () => {
  it("aviso não é erro", () => {
    expect(hasErrors(parseLatexLog("LaTeX Warning: Label may have changed."))).toBe(false);
    expect(hasErrors(parseLatexLog("./main.tex:1: Missing $ inserted."))).toBe(true);
  });
});

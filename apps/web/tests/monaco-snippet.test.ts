import { describe, expect, it } from "vitest";

import {
  hasPlaceholders,
  normalizeTrigger,
  toMonacoSnippet,
} from "@modules/latex-knowledge/domain/monaco-snippet";

/**
 * A tradução do delimitador legado.
 *
 * Cada caso aqui é uma linha que existe no `LatexMetadata.db` real — não invenção. O acervo tem
 * 349 templates com `§`, quatro com `$` literal e um punhado com CRLF, e é exatamente esse trio
 * que quebra um `replace` ingênuo.
 */
describe("toMonacoSnippet", () => {
  it("numera os pontos de parada na ordem em que aparecem", () => {
    // Linha real: `\addcontentsline{§file§}{§secunit§}{§entry§}`.
    const body = toMonacoSnippet("\\addcontentsline{§file§}{§secunit§}{§entry§}");

    // A chave que fecha o placeholder fica crua — é ela que o Monaco lê. As outras vão escapadas.
    expect(body).toBe("\\\\addcontentsline{${1:file}\\}{${2:secunit}\\}{${3:entry}\\}$0");
  });

  it("escapa o `$` literal — senão o Monaco abriria uma tabulação fantasma", () => {
    // Linha real do acervo, encurtada. As chaves também vão escapadas — só a que fecha um
    // placeholder fica crua, e aqui não há placeholder nenhum.
    expect(toMonacoSnippet("$ log_{b} a = c $")).toBe("\\$ log_{b\\} a = c \\$");
  });

  it("escapa a barra invertida de todo comando LaTeX", () => {
    expect(toMonacoSnippet("\\alpha")).toBe("\\\\alpha");
  });

  it("escapa a barra também dentro do valor do placeholder", () => {
    // `\addtolength{§\gnat§}{§length§}` existe no acervo com uma barra dentro do placeholder.
    const body = toMonacoSnippet("\\addtolength{§\\gnat§}{§length§}");
    expect(body).toContain("${1:\\\\gnat}");
  });

  it("normaliza CRLF do WPF para `\\n`", () => {
    const body = toMonacoSnippet("\\begin{abstract}\r\n\t§Conteúdo§\r\n\\end{abstract}");
    expect(body).not.toContain("\r");
    expect(body).toContain("\n\t${1:Conteúdo}\n");
  });

  it("não acrescenta `$0` quando não há ponto de parada", () => {
    expect(toMonacoSnippet("\\abovecaptionskip")).not.toContain("$0");
  });

  it("acrescenta `$0` quando há — para o Tab ter onde terminar", () => {
    expect(toMonacoSnippet("\\Alph{§counter§}").endsWith("$0")).toBe(true);
  });

  it("trata `§` desemparelhado como texto literal, sem engolir o resto", () => {
    // Nenhuma linha do acervo está assim hoje; a garantia é para quando alguma estiver.
    const body = toMonacoSnippet("\\frac{§a§}{§b");
    expect(body).not.toContain("${");
    expect(body).toContain("§");
  });
});

describe("hasPlaceholders", () => {
  it("exige o par — um `§` solto não é ponto de parada", () => {
    expect(hasPlaceholders("\\Alph{§counter§}")).toBe(true);
    expect(hasPlaceholders("\\alpha")).toBe(false);
    expect(hasPlaceholders("50§")).toBe(false);
  });
});

describe("normalizeTrigger", () => {
  it("tira a barra inicial — o legado grava `addto` e `\\addto` para a mesma coisa", () => {
    expect(normalizeTrigger("\\addto")).toBe("addto");
    expect(normalizeTrigger("addto")).toBe("addto");
    expect(normalizeTrigger("  \\alpha  ")).toBe("alpha");
  });
});

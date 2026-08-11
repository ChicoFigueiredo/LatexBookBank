import { describe, expect, it } from "vitest";

import { firstErrorMessage } from "@modules/rendering/domain/render-stats";

/**
 * "Último erro" na página de diagnóstico (§25).
 *
 * O dado guardado é a lista inteira de diagnósticos do job, e escolher **qual** deles mostrar é
 * decisão de produto: pegar o primeiro item faria a página apontar `Overfull \hbox` como causa de
 * uma falha de compilação.
 *
 * Ver issue #168.
 */

const diag = (over: Record<string, unknown>) =>
  JSON.stringify([{ severity: "error", message: "Undefined control sequence.", line: 2, ...over }]);

describe("a mensagem do último erro", () => {
  it("traz a linha junto — é a diferença entre procurar e achar", () => {
    expect(firstErrorMessage(diag({}))).toBe("L2: Undefined control sequence.");
  });

  it("erro sem linha vem só com a mensagem, sem `Lnull`", () => {
    // Acontece no erro de preâmbulo, que não está no texto de ninguém (#161).
    expect(firstErrorMessage(diag({ line: null }))).toBe("Undefined control sequence.");
  });

  it("**pula aviso e info** e vai até o erro", () => {
    const lista = JSON.stringify([
      { severity: "info", message: "Overfull \\hbox", line: 8 },
      { severity: "warning", message: "Font shape undefined", line: null },
      { severity: "error", message: "Missing $ inserted.", line: 5 },
    ]);

    expect(firstErrorMessage(lista)).toBe("L5: Missing $ inserted.");
  });

  it("lista só com aviso devolve `null` — não há erro a mostrar", () => {
    // Controle do teste acima: sem ele, uma implementação que pegasse o primeiro item da lista
    // passaria nos dois.
    const lista = JSON.stringify([{ severity: "info", message: "Overfull \\hbox", line: 8 }]);

    expect(firstErrorMessage(lista)).toBeNull();
  });

  it("JSON quebrado devolve `null`, não lança", () => {
    // A página de diagnóstico é aonde se vai quando as coisas já estão estranhas; ela não pode
    // ser a próxima coisa a quebrar.
    expect(firstErrorMessage("{isso não é json")).toBeNull();
    expect(firstErrorMessage("")).toBeNull();
  });

  it("JSON válido que não é lista devolve `null`", () => {
    expect(firstErrorMessage('{"severity":"error","message":"x"}')).toBeNull();
  });

  it("entrada sem `message` de texto é ignorada", () => {
    expect(firstErrorMessage(JSON.stringify([{ severity: "error", message: 42 }]))).toBeNull();
  });
});

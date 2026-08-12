import { describe, expect, it } from "vitest";

import { separarAlternativas } from "@modules/recognition/domain/separar-alternativas";

/**
 * A separação que decide se uma questão nasce inteira ou pela metade.
 *
 * Errar para mais é pior que errar para menos, e é o que a maioria destes testes guarda: uma
 * alternativa inventada a partir de prosa entra no acervo com cara de revisada, e só aparece
 * quando alguém imprime a prova. Não separar nada é visível na hora.
 */

describe("separarAlternativas", () => {
  it("separa o caso do acervo: enunciado e cinco alternativas", () => {
    const { statementLatex, options } = separarAlternativas(
      [
        "Um capital de R\\$ 5.000,00 é aplicado a juros compostos de 2\\% ao mês,",
        "durante 12 meses. Qual é o montante ao final do período?",
        "a) R\\$ 5.612,25",
        "b) R\\$ 6.341,21",
        "c) R\\$ 6.529,67",
        "d) R\\$ 6.712,10",
        "e) R\\$ 7.024,00",
      ].join("\n"),
    );

    expect(statementLatex).toContain("Qual é o montante");
    expect(statementLatex).not.toContain("5.612,25");
    expect(options).toHaveLength(5);
    expect(options[0]).toEqual({ label: "a", statementLatex: "R\\$ 5.612,25" });
    expect(options[4]?.label).toBe("e");
  });

  it("a alternativa continua nas linhas seguintes — fração quebra em duas", () => {
    const { options } = separarAlternativas(
      ["Calcule o limite.", "a) $\\frac{1}{2}$", "   com $x > 0$", "b) $\\frac{3}{4}$"].join("\n"),
    );

    expect(options).toHaveLength(2);
    expect(options[0]?.statementLatex).toBe("$\\frac{1}{2}$\ncom $x > 0$");
  });

  it("aceita os formatos que o acervo tem: (a), A., iii)", () => {
    const parenteses = separarAlternativas(["Pergunta.", "(a) um", "(b) dois"].join("\n"));
    expect(parenteses.options.map((o) => o.label)).toEqual(["a", "b"]);

    const ponto = separarAlternativas(["Pergunta.", "A. um", "B. dois"].join("\n"));
    expect(ponto.options.map((o) => o.label)).toEqual(["A", "B"]);

    const romanos = separarAlternativas(["Pergunta.", "i) um", "ii) dois", "iii) três"].join("\n"));
    expect(romanos.options.map((o) => o.label)).toEqual(["i", "ii", "iii"]);
  });

  it("o rótulo do livro é preservado, e não normalizado", () => {
    // "A" e "a" são coisas diferentes na hora de citar a questão, e o `duplicateSubtree` já
    // aprendeu que `originalLabel` é informação editorial insubstituível.
    const { options } = separarAlternativas(["Pergunta.", "A) um", "B) dois"].join("\n"));

    expect(options.map((o) => o.label)).toEqual(["A", "B"]);
  });

  it("não separa `f(x)` nem `a)` no meio da linha — a âncora é o começo", () => {
    const { options } = separarAlternativas(
      "Seja a) o coeficiente de $f(x)$ e b) o termo independente. Calcule a soma.",
    );

    expect(options).toEqual([]);
  });

  it("rótulos fora de ordem não são bloco de alternativas", () => {
    // `a) ... c) ...` sem o `b` é prosa que por acaso começa com letra e parêntese. Tratar como
    // alternativa criaria duas opções inventadas — o erro que passa por revisado.
    const { options } = separarAlternativas(
      ["Texto.", "a) primeira nota de rodapé", "c) terceira nota"].join("\n"),
    );

    expect(options).toEqual([]);
  });

  it("um rótulo sozinho não faz bloco", () => {
    expect(separarAlternativas(["Pergunta.", "a) resposta única"].join("\n")).options).toEqual([]);
  });

  it("recorte só das alternativas devolve tudo como enunciado", () => {
    // Sem pergunta, separar deixaria uma questão sem enunciado. Melhor devolver inteiro e deixar
    // a pessoa recortar de novo do que gravar metade.
    const bruto = ["a) um", "b) dois", "c) três"].join("\n");
    const { statementLatex, options } = separarAlternativas(bruto);

    expect(options).toEqual([]);
    expect(statementLatex).toBe(bruto);
  });

  it("discursiva passa inteira", () => {
    const bruto = "Demonstre que a soma dos ângulos internos de um triângulo é $180^\\circ$.";

    expect(separarAlternativas(bruto)).toEqual({ statementLatex: bruto, options: [] });
  });

  it("fórmula solta passa inteira", () => {
    expect(separarAlternativas("$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$").options).toEqual([]);
  });

  it("pega a maior sequência quando há ruído antes dela", () => {
    const { options } = separarAlternativas(
      ["Nota a) irrelevante", "Enunciado de verdade.", "a) um", "b) dois", "c) três"].join("\n"),
    );

    expect(options).toHaveLength(3);
  });

  it("nenhuma alternativa nasce marcada como correta", () => {
    // O modelo não sabe o gabarito. Marcar uma por adivinhação entrega uma questão errada com
    // cara de conferida — quem marca é a pessoa, no editor.
    const { options } = separarAlternativas(["Pergunta.", "a) um", "b) dois"].join("\n"));

    for (const opcao of options) {
      expect(Object.keys(opcao).sort()).toEqual(["label", "statementLatex"]);
    }
  });

  it("texto vazio não estoura", () => {
    expect(separarAlternativas("")).toEqual({ statementLatex: "", options: [] });
  });
});

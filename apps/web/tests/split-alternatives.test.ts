import { describe, expect, it } from "vitest";

import {
  applySplits,
  detectMergedBlocks,
  splitAlternatives,
} from "@modules/recognition/domain/split-alternatives";

/**
 * A separação que decide se uma questão nasce inteira ou pela metade.
 *
 * Errar para mais é pior que errar para menos, e é o que a maioria destes testes guarda: uma
 * alternativa inventada a partir de prosa entra no acervo com cara de revisada, e só aparece
 * quando alguém imprime a prova. Não separar nada é visível na hora.
 */

describe("splitAlternatives", () => {
  it("separa o caso do acervo: enunciado e cinco alternativas", () => {
    const { statementLatex, options } = splitAlternatives(
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
    const { options } = splitAlternatives(
      ["Calcule o limite.", "a) $\\frac{1}{2}$", "   com $x > 0$", "b) $\\frac{3}{4}$"].join("\n"),
    );

    expect(options).toHaveLength(2);
    expect(options[0]?.statementLatex).toBe("$\\frac{1}{2}$\ncom $x > 0$");
  });

  it("aceita os formatos que o acervo tem: (a), A., iii)", () => {
    const parenteses = splitAlternatives(["Pergunta.", "(a) um", "(b) dois"].join("\n"));
    expect(parenteses.options.map((o) => o.label)).toEqual(["a", "b"]);

    const ponto = splitAlternatives(["Pergunta.", "A. um", "B. dois"].join("\n"));
    expect(ponto.options.map((o) => o.label)).toEqual(["A", "B"]);

    const romanos = splitAlternatives(["Pergunta.", "i) um", "ii) dois", "iii) três"].join("\n"));
    expect(romanos.options.map((o) => o.label)).toEqual(["i", "ii", "iii"]);
  });

  it("o rótulo do livro é preservado, e não normalizado", () => {
    // "A" e "a" são coisas diferentes na hora de citar a questão, e o `duplicateSubtree` já
    // aprendeu que `originalLabel` é informação editorial insubstituível.
    const { options } = splitAlternatives(["Pergunta.", "A) um", "B) dois"].join("\n"));

    expect(options.map((o) => o.label)).toEqual(["A", "B"]);
  });

  it("não separa `f(x)` nem `a)` no meio da linha — a âncora é o começo", () => {
    const { options } = splitAlternatives(
      "Seja a) o coeficiente de $f(x)$ e b) o termo independente. Calcule a soma.",
    );

    expect(options).toEqual([]);
  });

  it("rótulos fora de ordem não são bloco de alternativas", () => {
    // `a) ... c) ...` sem o `b` é prosa que por acaso começa com letra e parêntese. Tratar como
    // alternativa criaria duas opções inventadas — o erro que passa por revisado.
    const { options } = splitAlternatives(
      ["Texto.", "a) primeira nota de rodapé", "c) terceira nota"].join("\n"),
    );

    expect(options).toEqual([]);
  });

  it("um rótulo sozinho não faz bloco", () => {
    expect(splitAlternatives(["Pergunta.", "a) resposta única"].join("\n")).options).toEqual([]);
  });

  it("recorte só das alternativas devolve tudo como enunciado", () => {
    // Sem pergunta, separar deixaria uma questão sem enunciado. Melhor devolver inteiro e deixar
    // a pessoa recortar de novo do que gravar metade.
    const bruto = ["a) um", "b) dois", "c) três"].join("\n");
    const { statementLatex, options } = splitAlternatives(bruto);

    expect(options).toEqual([]);
    expect(statementLatex).toBe(bruto);
  });

  it("discursiva passa inteira", () => {
    const bruto = "Demonstre que a soma dos ângulos internos de um triângulo é $180^\\circ$.";

    expect(splitAlternatives(bruto)).toEqual({ statementLatex: bruto, options: [] });
  });

  it("fórmula solta passa inteira", () => {
    expect(splitAlternatives("$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$").options).toEqual([]);
  });

  it("pega a maior sequência quando há ruído antes dela", () => {
    const { options } = splitAlternatives(
      ["Nota a) irrelevante", "Enunciado de verdade.", "a) um", "b) dois", "c) três"].join("\n"),
    );

    expect(options).toHaveLength(3);
  });

  it("nenhuma alternativa nasce marcada como correta", () => {
    // O modelo não sabe o gabarito. Marcar uma por adivinhação entrega uma questão errada com
    // cara de conferida — quem marca é a pessoa, no editor.
    const { options } = splitAlternatives(["Pergunta.", "a) um", "b) dois"].join("\n"));

    for (const opcao of options) {
      expect(Object.keys(opcao).sort()).toEqual(["label", "statementLatex"]);
    }
  });

  it("texto vazio não estoura", () => {
    expect(splitAlternatives("")).toEqual({ statementLatex: "", options: [] });
  });
});

/**
 * O caso `ocrMerged` do protótipo: duas alternativas coladas na mesma linha.
 *
 * Acontece de verdade em página de duas colunas, e a regra que protege o enunciado (âncora no
 * início da linha) é justamente a que produz o bloco unido. A resposta não é dividir sozinho — é
 * sinalizar e oferecer o gesto. Estes testes guardam o que **não** vira sinal, que é a metade
 * cara: um alarme falso ensina a ignorar alarmes.
 */
describe("detectMergedBlocks", () => {
  it("acha `b)` carregando o `c)` que o OCR colou junto", () => {
    const unidos = detectMergedBlocks([
      { label: "a", statementLatex: "R\\$ 5.612,25" },
      { label: "b", statementLatex: "R\\$ 6.341,21 c) R\\$ 6.529,67" },
      { label: "d", statementLatex: "R\\$ 6.712,10" },
    ]);

    expect(unidos).toHaveLength(1);
    expect(unidos[0]?.indice).toBe(1);
    expect(unidos[0]?.partes).toEqual([
      { label: "b", statementLatex: "R\\$ 6.341,21" },
      { label: "c", statementLatex: "R\\$ 6.529,67" },
    ]);
  });

  it("só o rótulo que **deveria vir a seguir** — `b)` citando `a)` fica quieto", () => {
    const unidos = detectMergedBlocks([
      { label: "a", statementLatex: "o dobro" },
      { label: "b", statementLatex: "o mesmo que a) mas ao quadrado" },
    ]);

    expect(unidos).toEqual([]);
  });

  it("se o próximo já é alternativa própria, não há bloco unido", () => {
    // Dividir aqui criaria um `c)` duplicado — dois com o mesmo rótulo, e o gabarito sem saber
    // qual é qual.
    const unidos = detectMergedBlocks([
      { label: "b", statementLatex: "vale c) para todo x" },
      { label: "c", statementLatex: "6.529,67" },
    ]);

    expect(unidos).toEqual([]);
  });

  it("rótulo no começo do próprio texto não conta", () => {
    // Seria a alternativa inteira virando a segunda metade, com a primeira vazia.
    expect(
      detectMergedBlocks([{ label: "b", statementLatex: "c) R\\$ 6.529,67" }]),
    ).toEqual([]);
  });

  it("romanos também: `ii)` carregando `iii)`", () => {
    const unidos = detectMergedBlocks([
      { label: "i", statementLatex: "primeira" },
      { label: "ii", statementLatex: "segunda iii) terceira" },
    ]);

    expect(unidos[0]?.partes.map((p) => p.label)).toEqual(["ii", "iii"]);
  });

  it("lista limpa não gera sinal nenhum", () => {
    const unidos = detectMergedBlocks([
      { label: "a", statementLatex: "um" },
      { label: "b", statementLatex: "dois" },
      { label: "c", statementLatex: "três" },
    ]);

    expect(unidos).toEqual([]);
  });
});

describe("applySplits", () => {
  const alt = (label: string, statementLatex: string) => ({ label, statementLatex });

  it("sem divisão aceita, a lista é a mesma", () => {
    const options = [alt("a", "um"), alt("b", "dois")];
    expect(applySplits(options, new Map())).toEqual(options);
  });

  it("aplica em cascata: o `d)` que ficou dentro do `c` novo também se divide", () => {
    // O caso que o e2e pegou: a segunda divisão é sobre um texto que não existia na lista original.
    const divididos = new Map([
      ["dois c) três d) quatro", [alt("b", "dois"), alt("c", "três d) quatro")]],
      ["três d) quatro", [alt("c", "três"), alt("d", "quatro")]],
    ]);

    const result = applySplits([alt("a", "um"), alt("b", "dois c) três d) quatro")], divididos);

    expect(result.map((entry) => entry.label)).toEqual(["a", "b", "c", "d"]);
  });

  it("uma divisão que contém a própria chave não laça para sempre", () => {
    const divididos = new Map([["x", [alt("a", "x"), alt("b", "y")]]]);

    const result = applySplits([alt("a", "x")], divididos);

    // Cinco passadas, cada uma acrescentando um `b`: o teto encerra.
    expect(result).toHaveLength(6);
  });
});

import { describe, expect, it } from "vitest";

import "@modules/questions/domain/plugins";
import { latexFromBlocks } from "@modules/questions/domain/question-latex";
import {
  pluginFor,
  type QuestionForPlugin,
} from "@modules/questions/domain/question-type-plugin";

/**
 * Múltipla escolha — uma ou mais corretas.
 *
 * O design pede que a diferença para a escolha simples seja **inequívoca** (§9): "não usar
 * exatamente a mesma UI trocando apenas o título". A diferença começa aqui, na validação — o que
 * um tipo recusa, o outro aceita — e chega até o gabarito, que aqui lista todas as letras.
 */

const plugin = pluginFor("MULTIPLE_CORRECT")!;
const simples = pluginFor("MULTIPLE_CHOICE")!;

const question = (over: Partial<QuestionForPlugin> = {}): QuestionForPlugin => ({
  type: "MULTIPLE_CORRECT",
  statementLatex: "Quais são pares?",
  solutionLatex: "Os divisíveis por dois.",
  complementLatex: "",
  options: [
    { id: "o1", statementLatex: "2", isCorrect: true },
    { id: "o2", statementLatex: "3", isCorrect: false },
    { id: "o3", statementLatex: "4", isCorrect: true },
  ],
  ...over,
});

const codes = (issues: readonly { code: string; severity: string }[], severity: string): string[] =>
  issues.filter((issue) => issue.severity === severity).map((issue) => issue.code);

describe("múltipla escolha", () => {
  it("aceita várias corretas — que é exatamente o que a escolha simples recusa", () => {
    expect(codes(plugin.validate(question()), "error")).toEqual([]);

    // O mesmo conteúdo, sob o outro tipo, é inválido. É a prova de que os dois tipos não são o
    // mesmo com rótulo diferente.
    expect(codes(simples.validate({ ...question(), type: "MULTIPLE_CHOICE" }), "error")).toContain(
      "multiple_correct_options",
    );
  });

  it("recusa nenhuma correta", () => {
    const nenhuma = question({
      options: [
        { id: "o1", statementLatex: "2", isCorrect: false },
        { id: "o2", statementLatex: "3", isCorrect: false },
      ],
    });

    expect(codes(plugin.validate(nenhuma), "error")).toContain("no_correct_option");
  });

  it("avisa quando só uma está correta — é escolha simples disfarçada", () => {
    const uma = question({
      options: [
        { id: "o1", statementLatex: "2", isCorrect: true },
        { id: "o2", statementLatex: "3", isCorrect: false },
      ],
    });

    expect(codes(plugin.validate(uma), "warning")).toContain("single_correct_option");
    // Aviso, não erro: funciona, mas o tipo provavelmente está errado — e o tipo muda como a
    // prova é impressa e como o aluno responde.
    expect(codes(plugin.validate(uma), "error")).toEqual([]);
  });

  it("avisa quando todas estão corretas", () => {
    const todas = question({
      options: [
        { id: "o1", statementLatex: "2", isCorrect: true },
        { id: "o2", statementLatex: "4", isCorrect: true },
      ],
    });

    expect(codes(plugin.validate(todas), "warning")).toContain("all_options_correct");
  });

  it("lista **todas** as letras corretas no gabarito", () => {
    const latex = latexFromBlocks(plugin.buildLatexBlocks(question(), { includeSolution: true }));
    expect(latex).toContain("\\textbf{Gabarito:} a, c.");
  });

  it("a letra sai da posição — reordenar move a letra, não o gabarito", () => {
    // A invariante da §13: identidade independe da letra, e reordenar preserva o gabarito. A
    // alternativa "4" era `c`; depois de ir para o começo, é `a` — e continua correta.
    const original = question();
    const reordenada = question({
      options: [
        original.options[2] as (typeof original.options)[number],
        original.options[0] as (typeof original.options)[number],
        original.options[1] as (typeof original.options)[number],
      ],
    });

    const latex = latexFromBlocks(
      plugin.buildLatexBlocks(reordenada, { includeSolution: true }),
    );
    expect(latex).toContain("\\textbf{Gabarito:} a, b.");
  });

  it("embaralhar leva o gabarito junto com a alternativa", () => {
    const sorteada = plugin.randomize!(question(), () => 0.99);

    const corretas = sorteada.options.filter((option) => option.isCorrect).map((o) => o.id);
    expect(corretas.sort()).toEqual(["o1", "o3"]);
  });
});

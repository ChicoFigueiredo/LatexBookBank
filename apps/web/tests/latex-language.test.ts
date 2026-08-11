import { describe, expect, it } from "vitest";

import {
  LATEX_LANGUAGE_CONFIGURATION,
  LATEX_LANGUAGE_ID,
  LATEX_MONARCH_TOKENS,
  QUESTION_FIELDS,
  isQuestionField,
} from "@modules/latex/domain/latex-language";

/**
 * A linguagem é **dado**, então dá para testá-la sem subir um editor.
 *
 * O que se protege aqui é a **ordem das regras**: no Monarch, a primeira que casa vence, e trocar
 * duas de lugar produz um destaque que parece funcionar até encontrar o caso que inverte tudo —
 * um `%` dentro de fórmula, um `\%` no meio do texto.
 */

const rootRules = LATEX_MONARCH_TOKENS.tokenizer.root;
const indexOfRule = (pattern: string): number =>
  rootRules.findIndex((rule) => String((rule as readonly unknown[])[0]).includes(pattern));

describe("ordem das regras do tokenizador", () => {
  it("comentário vem antes de tudo — senão `% custa $10` abriria modo matemático", () => {
    const comment = indexOfRule("%.*$");
    const inlineMath = indexOfRule("\\$");

    expect(comment).toBe(0);
    expect(comment).toBeLessThan(inlineMath);
  });

  it("`$$` vem antes de `$` — senão casaria como dois inline vazios", () => {
    const display = rootRules.findIndex((r) => String((r as readonly unknown[])[0]) === "/\\$\\$/");
    const inline = rootRules.findIndex((r) => String((r as readonly unknown[])[0]) === "/\\$/");

    expect(display).toBeGreaterThanOrEqual(0);
    expect(inline).toBeGreaterThan(display);
  });

  it("`\\begin`/`\\end` vêm antes do comando genérico — são o esqueleto, não um comando qualquer", () => {
    const environment = indexOfRule("begin|end");
    const anyCommand = indexOfRule("[a-zA-Z@]+");

    expect(environment).toBeLessThan(anyCommand);
  });

  it("o comando de um caractere existe — senão `\\%` viraria comentário e comeria a linha", () => {
    expect(indexOfRule("\\\\./")).toBeGreaterThanOrEqual(0);
  });
});

describe("estados de matemática", () => {
  const states = LATEX_MONARCH_TOKENS.tokenizer;

  it("todo estado de matemática sabe voltar", () => {
    for (const name of ["inlineMath", "displayMath", "displayMathBracket"] as const) {
      const rules = states[name] as readonly (readonly unknown[])[];
      const hasPop = rules.some((rule) => JSON.stringify(rule[1] ?? "").includes("@pop"));
      expect(hasPop, `${name} volta ao root`).toBe(true);
    }
  });

  it("comentário continua valendo dentro de matemática", () => {
    for (const name of ["inlineMath", "displayMath", "displayMathBracket"] as const) {
      const rules = states[name] as readonly (readonly unknown[])[];
      expect(String(rules[0]?.[0]), name).toContain("%");
    }
  });

  it("dentro de matemática, `\\$` é comando e não fecha o modo", () => {
    // A regra do comando de um caractere vem antes da que fecha — senão `\$` sairia do modo
    // matemático no meio de uma fórmula que só queria mostrar um cifrão.
    const rules = LATEX_MONARCH_TOKENS.tokenizer.inlineMath as readonly (readonly unknown[])[];
    const escape = rules.findIndex((r) => String(r[0]) === "/\\\\./");
    const close = rules.findIndex((r) => String(r[0]) === "/\\$/");

    expect(escape).toBeGreaterThanOrEqual(0);
    expect(escape).toBeLessThan(close);
  });
});

describe("configuração da linguagem", () => {
  it("comentário de linha é `%`", () => {
    expect(LATEX_LANGUAGE_CONFIGURATION.comments.lineComment).toBe("%");
  });

  it("`$` fecha sozinho — matemática inline é o gesto mais repetido do acervo", () => {
    expect(LATEX_LANGUAGE_CONFIGURATION.autoClosingPairs).toContainEqual({
      open: "$",
      close: "$",
    });
  });

  /**
   * `\[` e `\(` ficam de fora do fechamento automático: o Monaco casaria o `\` em qualquer
   * comando, e digitar `\alpha` passaria a inserir um fecha-colchete no meio da palavra.
   */
  it("nenhum par de fechamento automático começa com barra invertida", () => {
    for (const pair of LATEX_LANGUAGE_CONFIGURATION.autoClosingPairs) {
      expect(pair.open.startsWith("\\"), `${pair.open} não abre com barra`).toBe(false);
    }
  });

  it("todo bracket declarado também envolve seleção", () => {
    for (const [open, close] of LATEX_LANGUAGE_CONFIGURATION.brackets) {
      expect(LATEX_LANGUAGE_CONFIGURATION.surroundingPairs).toContainEqual({ open, close });
    }
  });
});

describe("campos da questão", () => {
  it("a ordem das abas é a da spec §10", () => {
    expect(QUESTION_FIELDS.map((f) => f.id)).toEqual([
      "statementLatex",
      "solutionLatex",
      "complementLatex",
    ]);
  });

  it("o guarda de tipo recusa campo inventado", () => {
    expect(isQuestionField("statementLatex")).toBe(true);
    expect(isQuestionField("updatedAt")).toBe(false);
    expect(isQuestionField("")).toBe(false);
  });

  it("o id da linguagem é estável — o Monaco registra por ele", () => {
    expect(LATEX_LANGUAGE_ID).toBe("latex");
  });
});

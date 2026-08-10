import { describe, expect, it } from "vitest";

import {
  affectedFields,
  PATCH_SCHEMA_VERSION,
  PatchRejectedError,
  parseQuestionPatch,
} from "@modules/agents/domain/question-patch";

/**
 * A whitelist é o arquivo inteiro.
 *
 * Um patch é o modelo pedindo para mudar o banco. Sem lista fechada, um campo como
 * `validationStatus` passaria por uma revisão de diff de LaTeX sem ninguém reparar — e o agente
 * teria acabado de se declarar aprovado.
 */

const base = { schemaVersion: PATCH_SCHEMA_VERSION, summary: "Corrige a crase no enunciado." };

const patch = (over: Record<string, unknown>) => parseQuestionPatch({ ...base, ...over });

describe("o que **não** é proponível", () => {
  const forbidden: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ["id da questão", { id: "outra-questao", fields: [{ field: "statementLatex", value: "x" }] }],
    ["status de validação", { metadata: { validationStatus: "VALID" } }],
    ["a fonte preservada", { fields: [{ field: "originalLatex", value: "x" }] }],
    ["identidade de import", { metadata: { legacyId: 42 } }],
    ["situação da questão", { metadata: { status: "READY" } }],
  ];

  for (const [label, body] of forbidden) {
    it(`recusa ${label}`, () => {
      expect(() => patch(body)).toThrow(PatchRejectedError);
    });
  }

  it("a recusa diz **qual** campo e por quê — a mensagem volta para o modelo", () => {
    // Ele costuma acertar na segunda tentativa quando sabe o que foi recusado.
    try {
      patch({ metadata: { difficulty: 3 } });
      expect.unreachable("deveria ter recusado");
    } catch (error) {
      expect(error).toBeInstanceOf(PatchRejectedError);
      expect((error as PatchRejectedError).issues.join(" ")).toMatch(/difficulty/);
      expect((error as PatchRejectedError).message).toMatch(/0, 2, 5, 7, 10/);
    }
  });
});

describe("o que é aceito", () => {
  it("os quatro campos de texto da questão", () => {
    const result = patch({
      fields: [
        { field: "statementLatex", value: "Novo enunciado" },
        { field: "solutionLatex", value: "Nova resolução" },
        { field: "complementLatex", value: "" },
        { field: "nickname", value: "Juros — 3" },
      ],
    });

    expect(result.fields).toHaveLength(4);
  });

  it("alternativa por id, nunca por letra", () => {
    // Um patch endereçado a "a alternativa c)" escreveria na errada depois de uma reordenação —
    // em silêncio, e com o gabarito parecendo certo (D9/§8.5).
    expect(() => patch({ options: [{ letter: "c", statementLatex: "x" }] })).toThrow();
    expect(patch({ options: [{ optionId: "o-3", isCorrect: true }] }).options).toHaveLength(1);
  });

  it("a escala de dificuldade é a legada — 0 · 2 · 5 · 7 · 10", () => {
    expect(patch({ metadata: { difficulty: 7 } }).metadata?.difficulty).toBe(7);
    expect(() => patch({ metadata: { difficulty: 4 } })).toThrow();
  });

  it("`videoUrl` precisa ser URL", () => {
    expect(() => patch({ metadata: { videoUrl: "não é url" } })).toThrow();
    expect(patch({ metadata: { videoUrl: "https://youtu.be/x" } }).metadata?.videoUrl).toBe(
      "https://youtu.be/x",
    );
  });
});

describe("coerência interna", () => {
  it("patch sem mudança nenhuma não é proposta", () => {
    expect(() => patch({})).toThrow(/sem mudança/);
  });

  it("o mesmo campo duas vezes é recusado", () => {
    // Qual das duas versões valeria?
    expect(() =>
      patch({
        fields: [
          { field: "statementLatex", value: "a" },
          { field: "statementLatex", value: "b" },
        ],
      }),
    ).toThrow(/duas vezes/);
  });

  it("a mesma alternativa duas vezes é recusada", () => {
    expect(() =>
      patch({
        options: [
          { optionId: "o-1", statementLatex: "a" },
          { optionId: "o-1", isCorrect: true },
        ],
      }),
    ).toThrow(/duas vezes/);
  });

  it("**duas corretas** é recusado antes de chegar à tela", () => {
    // O erro que a §8.5 mais teme, e que o agente comete ao "corrigir" o gabarito.
    expect(() =>
      patch({
        options: [
          { optionId: "o-1", isCorrect: true },
          { optionId: "o-2", isCorrect: true },
        ],
      }),
    ).toThrow(/mais de uma alternativa como correta/);
  });

  it("reordenação com id repetido é recusada", () => {
    expect(() => patch({ reorder: { optionIds: ["o-1", "o-1"] } })).toThrow(/repete/);
  });

  it("patch de alternativa que não muda nada é recusado", () => {
    expect(() => patch({ options: [{ optionId: "o-1" }] })).toThrow();
  });

  it("`summary` é obrigatório", () => {
    // Um diff correto por acidente e um correto de propósito são a mesma imagem na tela; a
    // diferença aparece na frase.
    expect(() =>
      parseQuestionPatch({
        schemaVersion: PATCH_SCHEMA_VERSION,
        fields: [{ field: "statementLatex", value: "x" }],
      }),
    ).toThrow(/summary/);
  });

  it("a versão do schema é obrigatória e fixa", () => {
    // Sem versão, "esse campo sumiu" e "esse patch é de antes" ficam indistinguíveis.
    expect(() => parseQuestionPatch({ ...base, schemaVersion: 99, fields: [] })).toThrow();
  });
});

describe("campos afetados", () => {
  it("lista o que o patch toca, para a tela mostrar antes de qualquer diff", () => {
    const result = patch({
      fields: [{ field: "statementLatex", value: "x" }],
      options: [{ optionId: "o-1", isCorrect: true }],
      metadata: { board: "CEBRASPE" },
      tags: { names: ["juros"] },
    });

    expect(affectedFields(result)).toEqual(["statementLatex", "1 alternativa(s)", "board", "tags"]);
  });
});

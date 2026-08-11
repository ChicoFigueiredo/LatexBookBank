import { describe, expect, it } from "vitest";

import {
  hasProblem,
  NODE_STATUS_LABELS,
  statusFor,
} from "@modules/document-tree/domain/node-status";

/**
 * Qual estado a árvore mostra quando mais de um é verdadeiro.
 *
 * A `Tree` tem **um** slot por nó, e uma questão pode estar inválida, com render quebrado e não
 * salva ao mesmo tempo. A escolha é de produto, e por isso está aqui e não dentro do `map` que
 * monta a lista.
 */

describe("a precedência", () => {
  it("não salvo vence tudo — é o único que se perde ao clicar em outro nó", () => {
    expect(
      statusFor({ unsaved: true, validationStatus: "INVALID", lastRenderState: "FAILED" }),
    ).toBe("unsaved");
  });

  it("render quebrado vence validação", () => {
    // Os dois são "algo está errado", mas o render falhou por algo que a pessoa acabou de causar;
    // a validação costuma ser dívida antiga do acervo.
    expect(statusFor({ validationStatus: "INVALID", lastRenderState: "FAILED" })).toBe(
      "render_failed",
    );
  });

  it("inválida vence validada, e validada vence render em dia", () => {
    expect(statusFor({ validationStatus: "INVALID", lastRenderState: "DONE" })).toBe("invalid");
    expect(statusFor({ validationStatus: "VALID", lastRenderState: "DONE" })).toBe("valid");
    expect(statusFor({ validationStatus: "UNVALIDATED", lastRenderState: "DONE" })).toBe(
      "render_done",
    );
  });
});

describe("quando não mostrar nada", () => {
  it("questão nunca tocada não ganha selo", () => {
    // Uma árvore em que **todo** nó tem indicador é uma árvore em que nenhum chama atenção.
    expect(statusFor({ validationStatus: "UNVALIDATED" })).toBeNull();
    expect(statusFor({})).toBeNull();
  });

  it("estado desconhecido no banco não vira selo inventado", () => {
    // O banco guarda `String` (o conector SQLite não tem `enum`), então lixo é possível.
    expect(statusFor({ validationStatus: "SEI_LA", lastRenderState: "TALVEZ" })).toBeNull();
  });

  it("render em andamento ainda não é notícia", () => {
    expect(statusFor({ lastRenderState: "RUNNING" })).toBeNull();
    expect(statusFor({ lastRenderState: "QUEUED" })).toBeNull();
  });
});

describe("o filtro de problema", () => {
  it("pega inválida e render quebrado", () => {
    expect(hasProblem({ validationStatus: "INVALID" })).toBe(true);
    expect(hasProblem({ lastRenderState: "FAILED" })).toBe(true);
  });

  it("**pega a questão que está sendo editada**, cujo selo diz outra coisa", () => {
    // É a razão de o filtro não sair do rótulo: derivá-lo do selo esconderia a questão
    // exatamente do filtro que a procura.
    const facts = { unsaved: true, validationStatus: "INVALID" };

    expect(statusFor(facts)).toBe("unsaved");
    expect(hasProblem(facts)).toBe(true);
  });

  it("questão sadia fica de fora", () => {
    expect(hasProblem({ validationStatus: "VALID", lastRenderState: "DONE" })).toBe(false);
    expect(hasProblem({})).toBe(false);
  });
});

describe("os rótulos", () => {
  it("todo estado tem rótulo — selo sem nome é enigma para quem usa leitor de tela", () => {
    for (const status of Object.keys(NODE_STATUS_LABELS)) {
      expect(NODE_STATUS_LABELS[status as keyof typeof NODE_STATUS_LABELS]).toBeTruthy();
    }
  });
});

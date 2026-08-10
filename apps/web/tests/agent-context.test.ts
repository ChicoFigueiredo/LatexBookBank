import { describe, expect, it } from "vitest";

import {
  attach,
  clearContext,
  contextSize,
  ContextTooLargeError,
  detach,
  EMPTY_CONTEXT,
  MAX_CONTEXT_CHARS,
  renderContext,
  selectionItem,
  type ContextItem,
} from "@modules/agents/domain/agent-context";

/**
 * O contexto é montado pelo usuário, item a item.
 *
 * É o que separa este painel de um chat com acesso ao banco: um agente que decide sozinho o que
 * ler é um agente cujo custo ninguém prevê e cujo vazamento ninguém audita.
 */

const item = (over: Partial<ContextItem> = {}): ContextItem => ({
  id: "q-1",
  kind: "question",
  label: "Questão 1",
  content: "Enunciado",
  explicit: true,
  ...over,
});

describe("anexar", () => {
  it("começa vazio — e vazio é um estado legítimo", () => {
    expect(EMPTY_CONTEXT.items).toEqual([]);
    expect(renderContext(EMPTY_CONTEXT)).toBe("");
  });

  it("o mesmo id **substitui**, não duplica", () => {
    // Anexar a seleção do Monaco duas vezes é o gesto mais provável de todos, e duas cópias
    // seriam pagas duas vezes sem servir para nada.
    const first = attach(EMPTY_CONTEXT, item({ id: "sel", content: "abc" }));
    const second = attach(first, item({ id: "sel", content: "abcdef" }));

    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.content).toBe("abcdef");
  });

  it("substituir preserva a posição na barra", () => {
    // Um item que se atualiza não deve pular para o fim: a barra é lida da esquerda, e o pulo
    // faria parecer que algo novo entrou.
    const context = [item({ id: "a" }), item({ id: "b" }), item({ id: "c" })].reduce(
      attach,
      EMPTY_CONTEXT,
    );
    const updated = attach(context, item({ id: "b", content: "novo" }));

    expect(updated.items.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    expect(updated.items[1]?.content).toBe("novo");
  });

  it("recusa quando passaria do teto, dizendo o que fazer", () => {
    // Não é limite de token — é limite de surpresa.
    const grande = item({ id: "g", content: "x".repeat(MAX_CONTEXT_CHARS) });
    const context = attach(EMPTY_CONTEXT, grande);

    expect(() => attach(context, item({ id: "outro", content: "y" }))).toThrow(
      ContextTooLargeError,
    );
    expect(() => attach(context, item({ id: "outro", content: "y" }))).toThrow(/Remova algum item/);
  });

  it("substituir por algo **menor** cabe mesmo com o contexto cheio", () => {
    // O item antigo sai da conta antes de o novo entrar. Sem isso, encolher a seleção seria
    // impossível justamente quando é a única saída.
    const context = attach(
      EMPTY_CONTEXT,
      item({ id: "g", content: "x".repeat(MAX_CONTEXT_CHARS) }),
    );
    const menor = attach(context, item({ id: "g", content: "x" }));

    expect(contextSize(menor)).toBe(1);
  });

  it("o que o painel anexou sozinho fica marcado", () => {
    // Continua removível — a diferença é só que não foi um gesto do usuário, e ele precisa notar.
    const context = attach(EMPTY_CONTEXT, item({ explicit: false }));
    expect(context.items[0]?.explicit).toBe(false);
  });
});

describe("remover", () => {
  it("tira só o item pedido", () => {
    const context = [item({ id: "a" }), item({ id: "b" })].reduce(attach, EMPTY_CONTEXT);
    expect(detach(context, "a").items.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("remover o que não está lá não quebra nem muda nada", () => {
    const context = attach(EMPTY_CONTEXT, item());
    expect(detach(context, "nada").items).toHaveLength(1);
  });

  it("limpar zera", () => {
    expect(clearContext().items).toEqual([]);
  });
});

describe("seleção do editor", () => {
  it("o rótulo diz de onde o trecho veio", () => {
    // Um `\frac{1}{2}` solto não diz onde estava, e a resposta costuma precisar apontar de volta.
    expect(selectionItem({ text: "\\frac{1}{2}", startLine: 12, endLine: 12 }).label).toBe(
      "Seleção (linha 12)",
    );
    expect(selectionItem({ text: "a\nb", startLine: 3, endLine: 7 }).label).toBe(
      "Seleção (linhas 3–7)",
    );
  });

  it("anexar de novo substitui a seleção anterior", () => {
    // Selecionar, anexar, mudar a seleção e anexar outra vez é a sequência normal. Guardar as
    // duas encheria a barra de trechos que o usuário já não está olhando — e ele pagaria pelos
    // dois.
    const first = attach(EMPTY_CONTEXT, selectionItem({ text: "a", startLine: 1, endLine: 1 }));
    const second = attach(first, selectionItem({ text: "bbb", startLine: 9, endLine: 9 }));

    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.content).toBe("bbb");
  });
});

describe("o que o modelo recebe", () => {
  it("cada item vai rotulado e delimitado", () => {
    // Sem rótulo o modelo não distingue o enunciado do trecho selecionado, e responde sobre o
    // pedaço errado — o modo de falha mais difícil de perceber, porque continua plausível.
    const context = [
      item({ id: "q", label: "Questão 1", content: "Enunciado" }),
      item({ id: "s", kind: "selection", label: "Seleção", content: "\\frac{1}{2}" }),
    ].reduce(attach, EMPTY_CONTEXT);

    const rendered = renderContext(context);
    expect(rendered).toContain("## Questão 1 (question)");
    expect(rendered).toContain("## Seleção (selection)");
    expect(rendered).toContain("---");
  });

  it("a ordem da barra é a ordem que o modelo lê", () => {
    const context = [item({ id: "a", label: "A" }), item({ id: "b", label: "B" })].reduce(
      attach,
      EMPTY_CONTEXT,
    );
    expect(renderContext(context).indexOf("## A")).toBeLessThan(
      renderContext(context).indexOf("## B"),
    );
  });
});

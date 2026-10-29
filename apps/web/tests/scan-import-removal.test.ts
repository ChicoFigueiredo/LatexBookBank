import { describe, expect, it } from "vitest";

import { planImportRemoval, type ImportedNode } from "@modules/scan/domain/import-removal";

/**
 * Apagar uma importação (D57, ADR 0006): o que volta para a lixeira e o que fica.
 *
 * O que se afirma aqui é a promessa feita ao autor: **nada que ele editou à mão se perde**, e o
 * que segura um nó de pé é dito com todas as letras, porque a confirmação mostra isso antes de
 * apagar.
 */

const APROVACAO = new Date("2026-09-19T10:00:00Z");
const DEPOIS = new Date("2026-09-19T18:00:00Z");
const DURANTE = new Date("2026-09-19T10:00:03Z");

const node = (over: Partial<ImportedNode> & Pick<ImportedNode, "id">): ImportedNode => ({
  parentId: null,
  kind: "SECTION",
  title: null,
  originalLabel: null,
  approvedAt: APROVACAO,
  updatedAt: APROVACAO,
  question: null,
  editedByHand: false,
  hasOutsideChildren: false,
  ...over,
});

describe("apagar a importação", () => {
  it("manda para a lixeira o que o scan criou e ninguém tocou", () => {
    const plano = planImportRemoval([
      node({ id: "cap", kind: "CHAPTER" }),
      node({ id: "sec", kind: "SECTION", parentId: "cap" }),
      node({ id: "q1", kind: "QUESTION", parentId: "sec", question: { status: "DRAFT", updatedAt: APROVACAO } }),
    ]);

    expect([...plano.trash].sort()).toEqual(["cap", "q1", "sec"]);
    expect(plano.kept).toEqual([]);
    expect(plano.counts).toMatchObject({ CHAPTER: 1, SECTION: 1, QUESTION: 1 });
  });

  it("a gravação da própria aprovação não conta como edição", () => {
    // `updatedAt` sai alguns segundos depois de `approvedAt`: é a mesma transação escrevendo o
    // corpo e as âncoras. Tratar isso como "editado à mão" preservaria o livro inteiro.
    const plano = planImportRemoval([node({ id: "sec", updatedAt: DURANTE })]);
    expect(plano.trash).toEqual(["sec"]);
  });

  it("preserva o que foi editado depois de aprovado, e diz por quê", () => {
    const plano = planImportRemoval([
      node({ id: "sec" }),
      node({ id: "outra", updatedAt: DEPOIS }),
    ]);

    expect(plano.trash).toEqual(["sec"]);
    expect(plano.kept).toEqual([{ id: "outra", reason: "editado depois de aprovado" }]);
  });

  it("preserva a questão conferida — conferir é leitura humana", () => {
    const plano = planImportRemoval([
      node({ id: "q1", kind: "QUESTION", question: { status: "READY", updatedAt: APROVACAO } }),
    ]);
    expect(plano.trash).toEqual([]);
    expect(plano.kept[0]?.reason).toBe("conferida");
  });

  it("preserva a questão cujo texto mudou", () => {
    const plano = planImportRemoval([
      node({ id: "q1", kind: "QUESTION", question: { status: "DRAFT", updatedAt: DEPOIS } }),
    ]);
    expect(plano.kept[0]?.reason).toBe("editado depois de aprovado");
  });

  it("preserva a revisão feita por gente, mesmo sem `updatedAt` novo", () => {
    // O histórico é o sinal mais forte: alguém gravou uma versão do corpo com a própria mão.
    const plano = planImportRemoval([node({ id: "sec", editedByHand: true })]);
    expect(plano.kept[0]?.reason).toBe("tem revisão feita à mão");
  });

  it("o pai de um nó preservado fica de pé, ou o filho sumiria junto", () => {
    // Apagar um nó na árvore leva a subárvore inteira. Mandar o capítulo para a lixeira levaria
    // a questão editada com ele — que é exatamente o que a promessa proíbe.
    const plano = planImportRemoval([
      node({ id: "cap", kind: "CHAPTER" }),
      node({ id: "sec", kind: "SECTION", parentId: "cap" }),
      node({ id: "q1", kind: "QUESTION", parentId: "sec", question: { status: "READY", updatedAt: APROVACAO } }),
      node({ id: "q2", kind: "QUESTION", parentId: "sec", question: { status: "DRAFT", updatedAt: APROVACAO } }),
    ]);

    expect(plano.trash).toEqual(["q2"]);
    expect(plano.kept.map((k) => `${k.id}:${k.reason}`)).toEqual([
      "cap:contém trabalho preservado",
      "sec:contém trabalho preservado",
      "q1:conferida",
    ]);
  });

  it("o nó com filho de fora fica de pé — senão o filho ficaria órfão", () => {
    // O scan criou o capítulo; a pessoa pendurou uma seção nele depois. Apagar o capítulo levaria
    // a seção junto (ela não está na lista) ou a deixaria viva apontando para um pai excluído —
    // e a árvore promove órfão à raiz do livro, sem avisar.
    const plano = planImportRemoval([
      node({ id: "cap", kind: "CHAPTER", hasOutsideChildren: true }),
      node({ id: "outro", kind: "CHAPTER" }),
    ]);

    expect(plano.trash).toEqual(["outro"]);
    expect(plano.kept).toEqual([{ id: "cap", reason: "tem filho que não veio desta importação" }]);
  });

  it("conta o que vai para a lixeira por tipo — é o que a confirmação mostra", () => {
    const plano = planImportRemoval([
      node({ id: "a", kind: "EXAMPLE" }),
      node({ id: "b", kind: "EXAMPLE" }),
      node({ id: "c", kind: "QUESTION", question: { status: "DRAFT", updatedAt: APROVACAO } }),
      node({ id: "d", kind: "QUESTION", question: { status: "READY", updatedAt: APROVACAO } }),
    ]);

    expect(plano.counts).toEqual({ EXAMPLE: 2, QUESTION: 1 });
    expect(plano.keptCount).toBe(1);
  });
});

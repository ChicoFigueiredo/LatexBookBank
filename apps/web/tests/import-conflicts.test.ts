import { describe, expect, it } from "vitest";

import type { ImportCollision } from "@modules/portability/domain/import-conflicts";
import {
  type ImportConflict,
  dedupeCollisions,
  describeConflict,
  formatCount,
} from "@modules/portability/domain/import-conflicts";

/**
 * A frase que transforma "2 conflitos" numa decisão.
 *
 * A tela dizia "2 item(ns) já existem no acervo" — sem nome, sem números, e com o plural de quem
 * desistiu de escrever a frase. O protótipo escreve os três fatos e a garantia, e cada um faz
 * trabalho: o nome identifica, os dois números provam que não é o mesmo livro parado no tempo, e a
 * garantia é o que permite clicar em "Importar" sem medo.
 */

const colisao = (parcial: Partial<ImportCollision> & { existingId: string }): ImportCollision => ({
  kind: "publication",
  by: "legacyId",
  value: 1,
  ...parcial,
});

const conflito = (
  parcial: Partial<ImportConflict> & { title: string },
): ImportConflict => ({
  kind: "publication",
  existingQuestions: null,
  incomingQuestions: null,
  existingId: "x",
  ...parcial,
});

describe("dedupeCollisions", () => {
  it("um livro que casa por duas chaves é UM conflito", () => {
    // `toRuntime` empurra uma colisão por chave que bateu. "2 conflitos" para um livro só faz o
    // usuário procurar o segundo livro, que não existe.
    const colisoes = [
      colisao({ existingId: "pub-1", by: "legacyId", value: 7 }),
      colisao({ existingId: "pub-1", by: "legacyUuid", value: "abc" }),
    ];

    expect(dedupeCollisions(colisoes)).toHaveLength(1);
  });

  it("livros diferentes continuam conflitos diferentes", () => {
    const colisoes = [colisao({ existingId: "pub-1" }), colisao({ existingId: "pub-2" })];

    expect(dedupeCollisions(colisoes)).toHaveLength(2);
  });

  it("questão e publicação com o mesmo id não se confundem", () => {
    const colisoes = [
      colisao({ existingId: "mesmo", kind: "publication" }),
      colisao({ existingId: "mesmo", kind: "question" }),
    ];

    expect(dedupeCollisions(colisoes)).toHaveLength(2);
  });

  it("lista vazia continua vazia", () => {
    expect(dedupeCollisions([])).toEqual([]);
  });
});

describe("describeConflict", () => {
  it("é a frase do protótipo, com os dois números", () => {
    expect(
      describeConflict(
        conflito({ title: "FME 1", existingQuestions: 148, incomingQuestions: 152 }),
      ),
    ).toBe(
      "“FME 1” já existe com 148 questões — o arquivo traz 152. Nada será sobrescrito sem sua escolha.",
    );
  });

  it("sem as contagens, encolhe em vez de inventar — mas nunca perde a garantia", () => {
    const frase = describeConflict(conflito({ title: "FME 2" }));

    expect(frase).toBe("“FME 2” já existe no acervo. Nada será sobrescrito sem sua escolha.");
    expect(frase).toContain("Nada será sobrescrito");
  });

  it("uma questão só diz o que acontece com ela", () => {
    expect(describeConflict(conflito({ title: "Questão 27", kind: "question" }))).toBe(
      "“Questão 27” já existe no acervo. A questão do arquivo entra como cópia.",
    );
  });

  it("a biblioteca de mesma origem diz que o arquivo entra ao lado, sem tocar nela", () => {
    expect(describeConflict(conflito({ title: "Fundamentos", kind: "workspace" }))).toBe(
      "A biblioteca “Fundamentos” já veio desta mesma origem. O arquivo entra como uma biblioteca nova, ao lado dela.",
    );
  });

  it("singular de “1 questão”", () => {
    expect(
      describeConflict(conflito({ title: "X", existingQuestions: 1, incomingQuestions: 2 })),
    ).toContain("já existe com 1 questão —");
  });

  it("livro vazio no destino ainda é conflito, e diz zero sem rodeio", () => {
    expect(
      describeConflict(conflito({ title: "X", existingQuestions: 0, incomingQuestions: 152 })),
    ).toContain("já existe com 0 questões —");
  });
});

describe("numero", () => {
  it("separa milhar em pt-BR: 1247 num painel de decisão se lê errado de relance", () => {
    expect(formatCount(1247)).toBe("1.247");
    expect(formatCount(64)).toBe("64");
  });
});

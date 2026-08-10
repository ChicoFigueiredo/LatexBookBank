import { describe, expect, it } from "vitest";

import {
  diffSnapshots,
  parseSnapshot,
  type RevisionSnapshot,
} from "@modules/questions/domain/revision-diff";
import { snapshotOf } from "@modules/agents/domain/apply-patch";

/**
 * O diff entre revisões, e a prova de que restaurar devolve o estado **exato**.
 *
 * "Parecido" não serve: o acervo tem vinte anos, e uma restauração que devolve quase o mesmo
 * texto é pior que nenhuma — ninguém confere caractere a caractere um enunciado que já parece
 * certo.
 */

const snapshot = (over: Partial<RevisionSnapshot> = {}): RevisionSnapshot => ({
  statementLatex: "Qual é a taxa?",
  solutionLatex: "",
  complementLatex: "",
  nickname: null,
  options: [
    { id: "o-1", statementLatex: "1\\%", isCorrect: false },
    { id: "o-2", statementLatex: "2\\%", isCorrect: true },
  ],
  metadata: { board: "CESPE", year: 2024 },
  tags: ["juros"],
  ...over,
});

describe("o que mudou entre duas revisões", () => {
  it("estados idênticos não geram mudança nenhuma", () => {
    expect(diffSnapshots(snapshot(), snapshot())).toEqual([]);
  });

  it("campo de texto vira uma linha", () => {
    const changes = diffSnapshots(snapshot(), snapshot({ statementLatex: "Outra pergunta?" }));

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      id: "field:statementLatex",
      label: "Enunciado",
      before: "Qual é a taxa?",
      after: "Outra pergunta?",
      latex: true,
    });
  });

  it("alternativa acrescentada aparece como acréscimo, não como mudança de texto", () => {
    const changes = diffSnapshots(
      snapshot(),
      snapshot({
        options: [
          { id: "o-1", statementLatex: "1\\%", isCorrect: false },
          { id: "o-2", statementLatex: "2\\%", isCorrect: true },
          { id: "o-3", statementLatex: "3\\%", isCorrect: false },
        ],
      }),
    );

    expect(changes).toHaveLength(1);
    expect(changes[0]?.before).toBe("(não existia)");
    expect(changes[0]?.label).toBe("Alternativa c)");
  });

  it("alternativa removida usa o rótulo que ela tinha", () => {
    // Dizer "alternativa b)" sobre uma lista onde não há mais uma b) confunde mais que ajuda.
    const changes = diffSnapshots(
      snapshot(),
      snapshot({ options: [{ id: "o-1", statementLatex: "1\\%", isCorrect: false }] }),
    );

    expect(changes[0]?.label).toBe("Alternativa b) — removida");
    expect(changes[0]?.after).toBe("(removida)");
  });

  it("gabarito é linha própria, separada do texto", () => {
    const changes = diffSnapshots(
      snapshot(),
      snapshot({
        options: [
          { id: "o-1", statementLatex: "1\\%", isCorrect: true },
          { id: "o-2", statementLatex: "2\\%", isCorrect: false },
        ],
      }),
    );

    expect(changes.map((change) => change.id)).toEqual([
      "option:o-1:correct",
      "option:o-2:correct",
    ]);
  });

  it("tags fora de ordem **não** são mudança", () => {
    expect(diffSnapshots(snapshot(), snapshot({ tags: ["juros"] }))).toEqual([]);
    expect(diffSnapshots(snapshot({ tags: ["a", "b"] }), snapshot({ tags: ["b", "a"] }))).toEqual(
      [],
    );
  });

  it("metadado que sumiu conta como mudança para vazio", () => {
    const changes = diffSnapshots(snapshot(), snapshot({ metadata: { year: 2024 } }));

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ label: "Banca", before: "CESPE", after: "(vazio)" });
  });

  it("a ordem dos argumentos é cronológica — o antigo primeiro", () => {
    // Inverter faria a coluna "depois" mostrar o passado, que é o tipo de inversão que ninguém
    // nota até restaurar a versão errada.
    const changes = diffSnapshots(
      snapshot({ statementLatex: "antigo" }),
      snapshot({ statementLatex: "novo" }),
    );

    expect(changes[0]?.before).toBe("antigo");
    expect(changes[0]?.after).toBe("novo");
  });
});

describe("restaurar devolve o estado exato", () => {
  it("o snapshot sobrevive à ida e volta por JSON, sem perder nada", () => {
    // É a garantia inteira da Fase 10: `snapshotOf` grava, `parseSnapshot` lê, e o que sai tem
    // que ser idêntico ao que entrou — não parecido.
    const original = snapshot({
      statementLatex: "Um capital de \\SI{1000}{\\real} à taxa de 2\\%",
      solutionLatex: "M = C(1+it)",
      complementLatex: "",
      nickname: "Juros — 1",
      metadata: { board: "Cesgranrio", year: 2014, difficulty: 5, videoUrl: null },
      tags: ["juros simples", "matemática financeira"],
    });

    const restored = parseSnapshot(snapshotOf(original));

    expect(restored).toEqual(original);
    expect(diffSnapshots(original, restored)).toEqual([]);
  });

  it("acento e barra invertida atravessam intactos", () => {
    // O acervo é em português e cheio de LaTeX: um `\\` que vira `\` na volta corrompe a questão
    // em silêncio, e ninguém confere caractere a caractere um enunciado que já parece certo.
    const original = snapshot({
      statementLatex: "Qual é a razão? \\frac{1}{2} \\\\ \\textbf{Atenção}",
    });

    const restored = parseSnapshot(snapshotOf(original));
    expect(restored.statementLatex).toBe(original.statementLatex);
  });

  it("revisão antiga sem campo novo ganha default, em vez de `undefined`", () => {
    // Um snapshot gravado antes de um campo existir não pode derrubar a tela de histórico.
    const antiga = parseSnapshot(JSON.stringify({ statementLatex: "só isto" }));

    expect(antiga.options).toEqual([]);
    expect(antiga.tags).toEqual([]);
    expect(antiga.nickname).toBeNull();
  });

  it("o gabarito sobrevive à restauração", () => {
    // A invariante que a §8.5 mais protege: exatamente uma correta, e a mesma.
    const original = snapshot({
      options: [
        { id: "o-1", statementLatex: "a", isCorrect: false },
        { id: "o-2", statementLatex: "b", isCorrect: true },
        { id: "o-3", statementLatex: "c", isCorrect: false },
      ],
    });

    const restored = parseSnapshot(snapshotOf(original));
    const correct = restored.options.filter((option) => option.isCorrect);

    expect(correct).toHaveLength(1);
    expect(correct[0]?.id).toBe("o-2");
  });
});

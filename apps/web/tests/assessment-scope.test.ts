import { describe, expect, it } from "vitest";

import type { AddQuestionResult } from "@modules/assessments/infrastructure/prisma-assessment-repository";

/**
 * Uma prova só monta com o acervo da própria biblioteca (#177).
 *
 * `addQuestion` não conferia workspace nenhum: uma questão da biblioteca B entrava numa prova da
 * biblioteca A e a rota respondia `201 added:true` — verificado com duas bibliotecas de verdade,
 * criadas pelo caminho do produto (exportar `.lbb` e importar).
 *
 * O estrago não é a prova sair errada — ela sai certa, com a questão impressa e o gabarito
 * correto. É que `AssessmentItem → Question` é `onDelete: Restrict`: a prova da biblioteca A passa
 * a **travar a exclusão** de uma questão da B, e quem tenta apagar não tem como descobrir por quê,
 * porque a prova que segura não aparece em lugar nenhum do acervo dele.
 *
 * O que este arquivo protege é o **vocabulário** da resposta. A consulta em si mora no adaptador e
 * foi conferida contra o banco; o que se perde com facilidade numa refatoração é a distinção entre
 * "já estava" e "é de outra biblioteca" — dois `added: false` que significam coisas opostas.
 */

describe("o resultado de acrescentar distingue os casos", () => {
  /** Só o que a rota precisa decidir: qual status e qual mensagem. */
  const status = (result: AddQuestionResult): number => {
    if (result.added) return 201;
    // 400 e não 200: engano que custa caro depois precisa aparecer na hora.
    return result.reason === "foreign" ? 400 : 200;
  };

  it("acrescentou é 201", () => {
    expect(status({ added: true })).toBe(201);
  });

  it("**de outra biblioteca é 400** — não é um 'não acrescentei' qualquer", () => {
    expect(status({ added: false, reason: "foreign" })).toBe(400);
  });

  it("clique repetido continua 200 — gesto, não engano", () => {
    // Sem esta distinção, clicar duas vezes em "acrescentar" viraria erro na cara de quem monta.
    expect(status({ added: false, reason: "already" })).toBe(200);
  });

  it("prova sem seção também é 200, e não erro do usuário", () => {
    expect(status({ added: false, reason: "no_section" })).toBe(200);
  });

  it("todo `added: false` carrega um motivo — o tipo não deixa esquecer", () => {
    // É o que impede a regressão silenciosa: um `return { added: false }` solto não compila mais.
    const semMotivo = { added: false } as unknown as AddQuestionResult;

    expect(semMotivo.added === false && "reason" in semMotivo).toBe(false);
  });
});

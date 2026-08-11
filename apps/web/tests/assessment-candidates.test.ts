import { describe, expect, it } from "vitest";

import { candidatesWhere } from "@modules/assessments/infrastructure/prisma-candidate-where";

/**
 * **O que uma prova pode oferecer** (#187).
 *
 * A lista "acrescentar do acervo" trazia tudo do workspace, sem olhar o nó nem o que já estava na
 * prova. No acervo de demonstração isso eram oito questões, das quais **quatro na lixeira** e três
 * já incluídas.
 *
 * A da lixeira é o caso grave: uma prova montada com ela sai **impressa** com uma questão que a
 * pessoa acha ter excluído, e o erro aparece na sala. É pior que o caso da busca (#181), onde o
 * beco sem saída ao menos não virava papel.
 *
 * A já incluída é menor e igualmente errada: o botão devolvia `added: false` — um gesto oferecido
 * e recusado depois, que ensina a desconfiar da lista.
 */

const where = candidatesWhere("ws-1", "a-1");

describe("a condição de candidata", () => {
  it("exige a biblioteca da prova", () => {
    // Mesma regra da #177, agora do lado da leitura: oferecer o que não se pode acrescentar seria
    // convidar ao 400.
    expect(where["node"]).toMatchObject({ publication: { workspaceId: "ws-1" } });
  });

  it("**exclui a lixeira** — nó excluído não vira questão de prova", () => {
    expect(where["node"]).toMatchObject({ deletedAt: null });
  });

  it("exclui o que já está na prova", () => {
    expect(where["NOT"]).toEqual({
      assessmentItems: { some: { section: { assessmentId: "a-1" } } },
    });
  });

  it("as três condições convivem — nenhuma substitui a outra", () => {
    // O risco real é uma refatoração manter só a do workspace, que é a que "parece" a principal.
    const node = where["node"] as Record<string, unknown>;

    expect(Object.keys(node).sort()).toEqual(["deletedAt", "publication"]);
    expect(Object.keys(where).sort()).toEqual(["NOT", "node"]);
  });
});

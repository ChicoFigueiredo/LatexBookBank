import { describe, expect, it } from "vitest";

import { InvalidSortKeyError } from "@modules/document-tree/domain/fractional-index";

import { toErrorResponse } from "../app/api/tree-http";

/**
 * A chave fora de ordem entre irmãos (#260, ACV-09) é estado do acervo, não defeito do pedido.
 *
 * O restaurar já não a produz, mas um banco que ficou com dois irmãos na mesma chave antes da
 * correção ainda a encontra ao inserir entre eles. Um 500 sem JSON deixava a tela muda; o 409
 * deixa a mensagem chegar.
 */
describe("toErrorResponse", () => {
  it("sortKey fora de ordem vira 409 com mensagem, não 500", async () => {
    const response = toErrorResponse(new InvalidSortKeyError("a1", "limites fora de ordem"));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "conflict" });
  });
});

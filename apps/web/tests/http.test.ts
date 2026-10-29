import { describe, expect, it } from "vitest";

import { InvalidSortKeyError } from "@/shared/ordering/fractional-index";
import { NoSourcePdfError } from "@modules/scan/application/start-scan";
import { PublicationInAssessmentsError } from "@modules/publications/domain/publication-draft";
import { LibraryNotFoundError } from "@modules/workspaces/domain/library";
import { QuestionOutOfScopeError } from "@/shared/authorization/question-out-of-scope";
import { ConcurrencyConflictError, RendererUnavailableError } from "@/shared/ports";

import { CatalogRootNotAllowedError } from "../app/api/catalog/catalog-http";
import { BadRequestError, toErrorResponse, withErrors } from "../app/api/http";

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

/**
 * Um tradutor só (STE-06, ARQ-11): os erros que os quatro `*-http.ts` e os `instanceof` das rotas
 * mapeavam saem com o mesmo status e o mesmo código, chamem eles de qual rota for.
 */
describe("a tabela única de erro para HTTP", () => {
  const casos: ReadonlyArray<readonly [string, Error, number, Record<string, unknown>]> = [
    ["pedido mal formado", new BadRequestError("falta x"), 400, { error: "bad_request" }],
    ["livro sem PDF no scan", new NoSourcePdfError("p1"), 409, { error: "no_source_pdf" }],
    [
      "biblioteca que não existe",
      new LibraryNotFoundError("w1"),
      404,
      { error: "library_not_found" },
    ],
    [
      "livro preso a provas, com a lista",
      new PublicationInAssessmentsError(["Prova 1"]),
      409,
      { error: "publication_in_assessments", assessments: ["Prova 1"] },
    ],
    [
      "pasta fora da raiz do Calibre",
      new CatalogRootNotAllowedError(true),
      403,
      { error: "catalog_root_not_allowed" },
    ],
    [
      "worker de render fora do ar",
      new RendererUnavailableError("sem resposta"),
      503,
      { error: "renderer_unavailable" },
    ],
    [
      "questão de outra publicação",
      new QuestionOutOfScopeError("q1"),
      404,
      { error: "not_found", message: "Questão q1 não existe nesta publicação." },
    ],
    [
      "questão salva em outra aba",
      new ConcurrencyConflictError("Question", "q1", "a", "b"),
      409,
      { error: "conflict", expectedVersion: "a", actualVersion: "b" },
    ],
  ];

  for (const [caso, error, status, body] of casos) {
    it(`${caso}: ${status}`, async () => {
      const response = toErrorResponse(error);

      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject(body);
    });
  }

  it("o conflito de versão fala do recurso que mudou, não da tabela do banco", async () => {
    const corpo = await toErrorResponse(
      new ConcurrencyConflictError("DocumentNode", "n1", "a", "b"),
    ).json();

    expect(corpo.message).toBe("Este corpo foi salvo em outro lugar desde que você abriu.");
  });

  it("**o erro desconhecido é 500 com JSON**, e o detalhe não vai para o corpo", async () => {
    // Antes ele era relançado, e o Next respondia 500 sem JSON: a tela que fazia
    // `response.json()` mostrava uma mensagem enganosa no lugar da do servidor.
    const response = toErrorResponse(new Error("SQLITE_BUSY: database is locked em /data/x.db"));

    expect(response.status).toBe(500);
    const corpo = await response.json();
    expect(corpo).toMatchObject({ error: "internal" });
    expect(JSON.stringify(corpo)).not.toContain("SQLITE_BUSY");
  });

  it("`withErrors` traduz o que estoura fora de qualquer `try`", async () => {
    const handler = withErrors(async () => {
      throw new LibraryNotFoundError("w1");
    });

    const response = await handler();

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "library_not_found" });
  });
});

import { describe, expect, it } from "vitest";

import { buildWhere } from "@modules/questions/infrastructure/prisma-question-search-where";
import type { SearchQuery } from "@modules/questions/domain/search-query";

/**
 * **A busca só mostra o que existe em alguma tela** (#181).
 *
 * Ela não filtrava nada além dos critérios pedidos, e devolvia duas coisas que nenhuma outra tela
 * mostra: questão de nó **excluído** — a árvore a esconde por `deletedAt`, e "excluído" precisa
 * querer dizer a mesma coisa nos dois lugares — e questão **órfã**, sem nó nenhum.
 *
 * A órfã é o caso mais grave: `Question` só alcança um workspace pelo nó → publicação →
 * workspace. Sem nó ela não tem dono, não é exportada e não é escopada pelo guarda da #175. A
 * paleta a mostrava, e clicar levava a lugar nenhum.
 *
 * Este arquivo protege a **condição**, não a consulta: o risco real é alguém acrescentar um filtro
 * novo montando o `AND` do zero e levar a condição embora junto.
 */

const query = (over: Partial<SearchQuery> = {}): SearchQuery => ({
  text: "",
  tags: [],
  boards: [],
  institutions: [],
  years: [],
  types: [],
  difficulties: [],
  limit: 20,
  offset: 0,
  ...over,
});

/** As condições do `AND`, sem depender da ordem em que foram empilhadas. */
const conditions = (q: SearchQuery): Record<string, unknown>[] =>
  (buildWhere(q)["AND"] as Record<string, unknown>[]) ?? [];

const hasLiveNode = (q: SearchQuery): boolean =>
  conditions(q).some(
    (condition) =>
      JSON.stringify(condition) === JSON.stringify({ node: { is: { deletedAt: null } } }),
  );

describe("toda busca exige um nó vivo", () => {
  it("na busca vazia", () => {
    // A busca sem texto é a que a paleta faz ao abrir — e era ela que listava as órfãs.
    expect(hasLiveNode(query())).toBe(true);
  });

  it("na busca por texto", () => {
    expect(hasLiveNode(query({ text: "juros" }))).toBe(true);
  });

  it("com todos os filtros ligados de uma vez", () => {
    // O caso que uma refatoração quebra: muitos ramos empilhando condições.
    expect(
      hasLiveNode(
        query({
          text: "juros",
          tags: ["álgebra", "juros"],
          boards: ["Cesgranrio"],
          institutions: ["ITA"],
          years: [2014],
          types: ["MULTIPLE_CHOICE"],
          difficulties: [5],
        }),
      ),
    ).toBe(true);
  });

  it("o `where` **nunca** é vazio — busca sem critério ainda tem a condição", () => {
    // Antes, `and.length === 0` devolvia `{}`, que é "traga tudo, inclusive o que está no lixo".
    expect(buildWhere(query())).not.toEqual({});
  });
});

describe("os critérios pedidos continuam valendo", () => {
  it("texto procura em apelido, enunciado e título do nó", () => {
    const ors = conditions(query({ text: "juros" })).find((c) => "OR" in c)?.["OR"];

    expect(JSON.stringify(ors)).toContain("nickname");
    expect(JSON.stringify(ors)).toContain("statementLatex");
    expect(JSON.stringify(ors)).toContain("title");
  });

  it("duas tags viram duas condições — `E`, não `OU`", () => {
    // Marcar a segunda tag é o gesto de **estreitar**; com `in` ela ampliaria o resultado.
    const tagConditions = conditions(query({ tags: ["a", "b"] })).filter((c) => "tags" in c);

    expect(tagConditions).toHaveLength(2);
  });
});

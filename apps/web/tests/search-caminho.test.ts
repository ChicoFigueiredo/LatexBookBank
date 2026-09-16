import { describe, expect, it } from "vitest";

import {
  caminhoDe,
  type LocalizacaoDaQuestao,
} from "@modules/questions/domain/search-location";

/**
 * Onde a questão mora, na linha do resultado da busca (protótipo, 2190).
 *
 * A busca devolvia título e trecho, e nada de localização. Com 1.247 questões em 24 livros —
 * o tamanho declarado do acervo —, buscar "juros" e receber seis enunciados parecidos sem saber de
 * qual livro cada um é obriga a abrir os seis para descobrir. O caminho responde antes do clique.
 */

const no = (over: Partial<LocalizacaoDaQuestao> = {}): LocalizacaoDaQuestao => ({
  publication: { title: "Fundamentos de Matemática Elementar", nickname: "FME 1" },
  parent: { title: "Exercícios propostos", originalLabel: null, kind: "SECTION" },
  ...over,
});

describe("caminhoDe", () => {
  it("é o apelido do livro e o pai imediato", () => {
    expect(caminhoDe(no())).toBe("FME 1 › Exercícios propostos");
  });

  it("o apelido vem antes do título da capa — é ele que distingue volumes", () => {
    /*
     * Numa lista de resultados de cinco volumes da mesma coleção, "Fundamentos de Matemática
     * Elementar" repetido cinco vezes é ruído idêntico; "FME 1", "FME 3" distinguem. É a mesma
     * razão pela qual o apelido existe (§ do achado 4).
     */
    expect(caminhoDe(no())).toContain("FME 1");
    expect(caminhoDe(no())).not.toContain("Fundamentos de Matemática");
  });

  it("sem apelido, o título da capa serve", () => {
    expect(
      caminhoDe(no({ publication: { title: "Matemática para o ITA", nickname: null } })),
    ).toBe("Matemática para o ITA › Exercícios propostos");
  });

  it("pai sem título usa o rótulo do livro", () => {
    expect(
      caminhoDe(no({ parent: { title: null, originalLabel: "2", kind: "CHAPTER" } })),
    ).toBe("FME 1 › Capítulo 2");
  });

  it("pai sem nome nenhum some da linha, em vez de virar “› Sem título”", () => {
    // Um `QUESTION_GROUP` anônimo não acrescenta nada, e a linha fica melhor sem ele.
    expect(
      caminhoDe(no({ parent: { title: null, originalLabel: null, kind: "QUESTION_GROUP" } })),
    ).toBe("FME 1");
  });

  it("questão na raiz do livro mostra só o livro", () => {
    expect(caminhoDe(no({ parent: null }))).toBe("FME 1");
  });

  it("questão fora de qualquer árvore devolve `null`, e não um caminho inventado", () => {
    // Existe, é rara, e um endereço fabricado seria pior que a ausência dele.
    expect(caminhoDe(null)).toBeNull();
  });
});

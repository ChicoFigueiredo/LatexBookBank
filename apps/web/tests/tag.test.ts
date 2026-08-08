import { describe, expect, it } from "vitest";

import {
  dedupeTagNames,
  displayName,
  InvalidTagError,
  MAX_TAG_LENGTH,
  parseTagInput,
  rankSuggestions,
  sameTag,
  tagKey,
  type TagSuggestion,
} from "@modules/questions/domain/tag";

describe("displayName", () => {
  it("colapsa espaço e apara as pontas, mas **preserva a caixa**", () => {
    // A caixa é o que aparece na tela. Forçar minúscula deixaria o acervo com cara de banco de
    // dados — "Função Quadrática" é como se escreve em português.
    expect(displayName("  Função   Quadrática ")).toBe("Função Quadrática");
  });

  it("recusa vazio e recusa frase", () => {
    expect(() => displayName("   ")).toThrow(InvalidTagError);
    expect(() => displayName("x".repeat(MAX_TAG_LENGTH + 1))).toThrow(InvalidTagError);
  });
});

describe("tagKey", () => {
  it("as três grafias do mesmo assunto dão a mesma chave", () => {
    // É a decisão inteira do arquivo: num acervo alimentado por anos, estas seriam três linhas,
    // três filtros e três contagens — e a pessoa concluiria que o filtro não funciona.
    const chave = tagKey("Função Quadrática");

    expect(tagKey("função quadratica")).toBe(chave);
    expect(tagKey("  FUNÇÃO  QUADRÁTICA ")).toBe(chave);
  });

  it("digitar sem acento encontra com acento", () => {
    // No acervo em português, é o erro mais comum de digitação.
    expect(sameTag("funcao", "função")).toBe(true);
  });

  it("o custo da escolha, assumido: `sabia` e `sabiá` colidem", () => {
    // Vale para **tag**, que é rótulo curto de organização. Não vale para conteúdo de questão,
    // onde acento é significado — e lá o texto não passa por aqui.
    expect(sameTag("sabia", "sabiá")).toBe(true);
  });

  it("assuntos diferentes continuam diferentes", () => {
    expect(sameTag("álgebra", "algoritmo")).toBe(false);
  });
});

describe("dedupeTagNames", () => {
  it("preserva a **primeira** grafia", () => {
    // Trocar pela última faria o nome da tag mudar sozinho na tela de todo mundo.
    expect(dedupeTagNames(["Função", "funcao", "FUNÇÃO"])).toEqual(["Função"]);
  });

  it("um nome inválido não custa os outros", () => {
    // Isto roda sobre entrada colada; uma vírgula sobrando não deveria derrubar dezoito tags.
    expect(dedupeTagNames(["álgebra", "   ", "geometria"])).toEqual(["álgebra", "geometria"]);
  });
});

describe("parseTagInput", () => {
  it("separa por vírgula, apara e deduplica numa passada", () => {
    expect(parseTagInput("álgebra, funções ,  Álgebra ")).toEqual(["álgebra", "funções"]);
  });

  it("entrada vazia não vira tag vazia", () => {
    expect(parseTagInput(" , , ")).toEqual([]);
  });
});

describe("rankSuggestions", () => {
  const tags: TagSuggestion[] = [
    { id: "1", name: "Álgebra", usageCount: 120 },
    { id: "2", name: "Função Quadrática", usageCount: 40 },
    { id: "3", name: "Interpretação de funções", usageCount: 300 },
    { id: "4", name: "Geometria", usageCount: 200 },
  ];

  it("sem busca, as mais usadas primeiro — não as alfabéticas", () => {
    // Num acervo de milhares, as dez mais usadas cobrem a maioria dos casos; a ordem alfabética
    // esconderia justamente essas atrás de qualquer coisa que comece com "a".
    expect(rankSuggestions(tags, "").map((t) => t.name)).toEqual([
      "Interpretação de funções",
      "Geometria",
      "Álgebra",
      "Função Quadrática",
    ]);
  });

  it("prefixo vence conteúdo, mesmo com uso muito maior", () => {
    // Quem digita "fun" quer "Função", não "Interpretação de funções" — ainda que a segunda seja
    // sete vezes mais usada.
    expect(rankSuggestions(tags, "fun").map((t) => t.name)).toEqual([
      "Função Quadrática",
      "Interpretação de funções",
    ]);
  });

  it("a busca também ignora acento", () => {
    expect(rankSuggestions(tags, "algebra").map((t) => t.name)).toEqual(["Álgebra"]);
  });

  it("respeita o limite", () => {
    expect(rankSuggestions(tags, "", 2)).toHaveLength(2);
  });

  it("busca sem resultado devolve lista vazia, não tudo", () => {
    // Devolver tudo faria o autocomplete parecer quebrado justamente quando não achou nada.
    expect(rankSuggestions(tags, "zzz")).toEqual([]);
  });
});

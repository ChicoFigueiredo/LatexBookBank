import { describe, expect, it } from "vitest";

import type {
  TreeNodeRecord,
  TreeQuestionRecord,
} from "@modules/document-tree/domain/document-tree-repository";
import {
  fonteDaAnterior,
  fraseDaHeranca,
  metadadosHerdados,
  questaoAnterior,
} from "@modules/questions/domain/herdar-metadados";

/**
 * Herdar banca e ano da questão anterior — o que o protótipo promete no rodapé do seletor de tipo.
 *
 * O caso que decide o desenho é o quarto teste: inserir no fim de um capítulo, onde a questão
 * anterior está **dentro** do irmão de cima, e não é o irmão de cima. Comparar `sortKey` entre
 * irmãos acertaria os três primeiros testes e erraria justamente esse — que é o gesto mais comum
 * de quem cadastra uma prova inteira.
 */

function questao(over: Partial<TreeQuestionRecord> = {}): TreeQuestionRecord {
  return {
    id: "q",
    type: "MULTIPLE_CHOICE",
    updatedAt: new Date(0),
    statementLatex: "",
    solutionLatex: "",
    complementLatex: "",
    difficulty: 5,
    board: null,
    year: null,
    validationStatus: "UNVALIDATED",
    renderJobs: [],
    options: [],
    tags: [],
    ...over,
  };
}

function no(over: Partial<TreeNodeRecord> & { id: string; sortKey: string }): TreeNodeRecord {
  return {
    parentId: null,
    kind: "QUESTION",
    title: null,
    numberingStyle: "ARABIC",
    originalLabel: null,
    question: null,
    ...over,
  };
}

const FUVEST = questao({ id: "qa", board: "FUVEST", year: 2019, difficulty: 7 });

describe("questaoAnterior", () => {
  it("acha a irmã imediatamente acima", () => {
    const arvore = [
      no({ id: "n1", sortKey: "a0", question: FUVEST }),
      no({ id: "n2", sortKey: "a2", question: questao({ id: "qb", board: "UNICAMP" }) }),
    ];

    expect(questaoAnterior(arvore, { parentId: null, sortKey: "a1" })?.id).toBe("qa");
  });

  it("devolve nada quando a posição é a primeira do livro", () => {
    const arvore = [no({ id: "n1", sortKey: "a5", question: FUVEST })];

    expect(questaoAnterior(arvore, { parentId: null, sortKey: "a0" })).toBeNull();
  });

  it("ignora capítulo e seção — herda de questão, não de estrutura", () => {
    const arvore = [
      no({ id: "c1", sortKey: "a0", kind: "CHAPTER", title: "Capítulo 1" }),
      no({ id: "n1", sortKey: "a1", question: FUVEST }),
      no({ id: "c2", sortKey: "a2", kind: "CHAPTER", title: "Capítulo 2" }),
    ];

    expect(questaoAnterior(arvore, { parentId: null, sortKey: "a3" })?.id).toBe("qa");
  });

  it("**atravessa a fronteira do capítulo**: a anterior está dentro do irmão de cima", () => {
    /*
     * `c1` é o irmão que vem antes na raiz, e ele não é questão — a questão está dentro dele. Uma
     * busca só entre irmãos pararia em `c1`, não acharia questão nenhuma e nasceria sem banca.
     */
    const arvore = [
      no({ id: "c1", sortKey: "a0", kind: "CHAPTER", title: "Capítulo 1" }),
      no({ id: "n1", sortKey: "a0", parentId: "c1", question: questao({ id: "q1" }) }),
      no({ id: "n2", sortKey: "a1", parentId: "c1", question: FUVEST }),
    ];

    expect(questaoAnterior(arvore, { parentId: null, sortKey: "a5" })?.id).toBe("qa");
  });

  it("não herda de quem vem **depois** — a ordem é a de leitura, não a de criação", () => {
    const arvore = [
      no({ id: "c1", sortKey: "a5", kind: "CHAPTER", title: "Capítulo 9" }),
      no({ id: "n1", sortKey: "a0", parentId: "c1", question: FUVEST }),
    ];

    expect(questaoAnterior(arvore, { parentId: null, sortKey: "a0" })).toBeNull();
  });

  it("destino de outra publicação não vira herança da última questão desta", () => {
    const arvore = [no({ id: "n1", sortKey: "a0", question: FUVEST })];

    expect(questaoAnterior(arvore, { parentId: "de-outro-livro", sortKey: "a0" })).toBeNull();
  });
});

describe("metadadosHerdados", () => {
  it("leva banca, ano e dificuldade juntos", () => {
    expect(metadadosHerdados(FUVEST)).toEqual({ board: "FUVEST", year: 2019, difficulty: 7 });
  });

  it("**não** herda dificuldade sozinha", () => {
    // Sem banca e sem ano não há nada para a tela anunciar — e um campo que muda sem explicação é
    // pior que um campo no padrão.
    expect(metadadosHerdados(questao({ difficulty: 10 }))).toBeNull();
  });

  it("basta o ano para haver herança", () => {
    expect(metadadosHerdados(questao({ year: 2020 }))).toMatchObject({ year: 2020, board: null });
  });

  it("sem anterior, sem herança", () => {
    expect(metadadosHerdados(null)).toBeNull();
  });
});

describe("fraseDaHeranca", () => {
  it("nomeia o que vai junto", () => {
    expect(fraseDaHeranca({ board: "FUVEST", year: 2019, difficulty: 5 })).toBe(
      "herda FUVEST · 2019 da questão anterior",
    );
  });

  it("com só um dos dois, não sobra separador solto", () => {
    expect(fraseDaHeranca({ board: null, year: 2019, difficulty: 5 })).toBe(
      "herda 2019 da questão anterior",
    );
  });

  it("some inteira quando não há herança", () => {
    expect(fraseDaHeranca(null)).toBeNull();
    // Banca em branco no banco legado é string vazia, e "herda  da questão anterior" seria pior
    // que silêncio.
    expect(fraseDaHeranca({ board: "", year: null, difficulty: 5 })).toBeNull();
  });
});

describe("fonteDaAnterior — a previsão que o menu mostra", () => {
  /** A árvore como a tela recebe: achatada, em ordem de exibição, com `depth`. */
  const lista = [
    { depth: 0, question: null }, //                    0 · Capítulo 1
    { depth: 1, question: { source: "FUVEST · 2019" } }, // 1 ·   questão
    { depth: 1, question: { source: "UNICAMP · 2020" } }, // 2 ·   questão
    { depth: 0, question: null }, //                    3 · Capítulo 2
    { depth: 1, question: null }, //                    4 ·   questão sem banca
  ];

  it("com uma folha selecionada, herda dela mesma — o item novo entra ao lado", () => {
    expect(fonteDaAnterior(lista, 1)).toBe("FUVEST · 2019");
  });

  it("**com um capítulo selecionado, olha o fim da subárvore dele**, não a linha de baixo", () => {
    // O item novo entra *dentro* do Capítulo 1, no fim: a anterior é a UNICAMP, e não a FUVEST
    // que está logo abaixo do título do capítulo.
    expect(fonteDaAnterior(lista, 0)).toBe("UNICAMP · 2020");
  });

  it("pula quem não tem banca, em vez de desistir na primeira", () => {
    // Selecionando a questão sem banca (índice 4), a anterior com banca é a UNICAMP — duas linhas
    // acima, atravessando o título do Capítulo 2.
    expect(fonteDaAnterior(lista, 4)).toBe("UNICAMP · 2020");
  });

  it("sem seleção, a inserção é no fim do livro", () => {
    expect(fonteDaAnterior(lista, null)).toBe("UNICAMP · 2020");
  });

  it("nada acima, nada a herdar", () => {
    expect(fonteDaAnterior(lista, undefined as unknown as null)).toBeNull();
    expect(fonteDaAnterior([{ depth: 0, question: null }], 0)).toBeNull();
    expect(fonteDaAnterior([], null)).toBeNull();
  });

  it("índice fora da lista não inventa herança", () => {
    // `findIndex` devolve -1 quando a seleção some da árvore recarregada; o menu não pode
    // responder com a última questão do livro por causa disso.
    expect(fonteDaAnterior(lista, -1)).toBeNull();
  });
});

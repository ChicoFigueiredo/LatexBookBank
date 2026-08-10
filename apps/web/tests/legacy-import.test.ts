import { describe, expect, it } from "vitest";

import {
  DELIBERATELY_IGNORED_COLUMNS,
  detectCapabilities,
  questionColumnsFor,
} from "@modules/legacy-import/domain/legacy-schema";
import {
  classifyAsset,
  classifyNode,
  mapDifficulty,
  mapNumbering,
  siblingOrder,
  UnknownTipoQuestaoError,
} from "@modules/legacy-import/domain/legacy-mapping";
import {
  assertIdempotent,
  checkInvariants,
  ImportInvariantError,
} from "@modules/legacy-import/domain/import-invariants";

/**
 * O importador roda **uma vez**. Não há segunda chance de perceber que uma questão sumiu, que a
 * ordem embaralhou ou que o gabarito se perdeu — daí as regras aqui falharem alto em vez de
 * escolherem um default.
 */

describe("as três gerações de schema", () => {
  it("dez bibliotecas têm `LatexComplemento`", () => {
    const capabilities = detectCapabilities({
      migrations: ["20240317152417_add_LatexComplemento"],
      tables: ["Questao", "TagConhecimento"],
      questionColumns: ["IdQuestao", "LatexComplemento"],
    });

    expect(capabilities.generation).toBe("latex_complemento");
    expect(capabilities.hasComplemento).toBe(true);
  });

  it("duas pararam antes, e sem `TagConhecimento`", () => {
    const capabilities = detectCapabilities({
      migrations: ["20221124021733_Questao_Imagens_Completa"],
      tables: ["Questao"],
      questionColumns: ["IdQuestao"],
    });

    expect(capabilities.generation).toBe("imagens_completa");
    expect(capabilities.hasTagConhecimento).toBe(false);
  });

  it("duas não têm sequer histórico de migração", () => {
    const capabilities = detectCapabilities({
      migrations: null,
      tables: ["Questao"],
      questionColumns: ["IdQuestao"],
    });

    expect(capabilities.generation).toBe("pre_migrations");
    expect(capabilities.hasMigrationsTable).toBe(false);
  });

  it("a **coluna** manda sobre o registro de migração", () => {
    // Uma biblioteca restaurada de backup pode ter a linha da migração sem a coluna. Perguntar ao
    // schema é sempre mais barato que confiar num registro sobre o schema.
    const capabilities = detectCapabilities({
      migrations: ["20240317152417_add_LatexComplemento"],
      tables: ["Questao"],
      questionColumns: ["IdQuestao", "LatexEnunciado"],
    });

    expect(capabilities.hasComplemento).toBe(false);
    expect(questionColumnsFor(capabilities)).not.toContain("LatexComplemento");
  });

  it("migração desconhecida degrada para a geração mais antiga", () => {
    // Ler menos campos nunca corrompe; ler campo que não existe, sim.
    const capabilities = detectCapabilities({
      migrations: ["20990101000000_futuro"],
      tables: ["Questao"],
      questionColumns: ["IdQuestao"],
    });

    expect(capabilities.generation).toBe("pre_migrations");
  });

  it("o `SELECT` nunca pede `Ordem` nem `Correta`", () => {
    // `Ordem` no `SELECT` convida alguém a ordenar por ela um dia; `Correta` é vestigial.
    const columns = questionColumnsFor(
      detectCapabilities({ migrations: null, tables: [], questionColumns: [] }),
    );

    expect(columns).not.toContain("Ordem");
    expect(columns).not.toContain("Correta");
    expect(columns).not.toContain("IsExpanded");
  });

  it("o que é descartado está declarado, com motivo", () => {
    // Para o relatório poder dizer o que ignorou e por quê, em vez de omitir.
    expect(Object.keys(DELIBERATELY_IGNORED_COLUMNS)).toContain("Ordem");
    expect(DELIBERATELY_IGNORED_COLUMNS["Ordem"]).toMatch(/IdQuestao/);
  });
});

describe("o sinal de `TipoQuestao` separa estrutura de questão", () => {
  const cases: ReadonlyArray<readonly [number, string]> = [
    [-10, "CHAPTER"],
    [-9, "SECTION"],
    [-8, "SUBSECTION"],
    [-7, "SUBSECTION"],
    [-1, "QUESTION_GROUP"],
  ];

  for (const [tipo, kind] of cases) {
    it(`${tipo} → ${kind}`, () => {
      expect(classifyNode(tipo).kind).toBe(kind);
      expect(classifyNode(tipo).questionType).toBeNull();
    });
  }

  it("positivos viram questão, com o tipo do vocabulário", () => {
    expect(classifyNode(1)).toEqual({ kind: "QUESTION", questionType: "DISCURSIVE" });
    expect(classifyNode(2)).toEqual({ kind: "QUESTION", questionType: "MULTIPLE_CHOICE" });
    // Os tipos 3–7 têm zero linhas no acervo, mas existem no vocabulário: mapeá-los custa uma
    // linha e evita que um deles derrube o import se aparecer.
    expect(classifyNode(5).questionType).toBe("CESPE");
  });

  it("tipo desconhecido **para o import**, em vez de descartar a linha", () => {
    // Uma linha descartada em silêncio é uma questão que some sem ninguém notar.
    expect(() => classifyNode(-99)).toThrow(UnknownTipoQuestaoError);
    expect(() => classifyNode(42)).toThrow(UnknownTipoQuestaoError);
  });
});

describe("a ordem vem de `IdQuestao`, nunca de `Ordem`", () => {
  it("irmãos saem na ordem de inserção", () => {
    // Há um pai com 59 filhos todos em `Ordem = 0`: confiar nela embaralharia o acervo em
    // silêncio, que é o pior modo de falha num import que roda uma vez.
    const rows = [
      { IdQuestao: 30, IdQuestao_Pai: 1 },
      { IdQuestao: 10, IdQuestao_Pai: 1 },
      { IdQuestao: 20, IdQuestao_Pai: 1 },
    ];

    const ordered = siblingOrder(rows).get(1) ?? [];
    expect(ordered.map((entry) => entry.row.IdQuestao)).toEqual([10, 20, 30]);
  });

  it("as `sortKey` saem crescentes por bytes", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ IdQuestao: i, IdQuestao_Pai: null }));
    const keys = (siblingOrder(rows).get(null) ?? []).map((entry) => entry.sortKey);

    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("cada pai tem a própria sequência", () => {
    const rows = [
      { IdQuestao: 1, IdQuestao_Pai: null },
      { IdQuestao: 2, IdQuestao_Pai: 1 },
      { IdQuestao: 3, IdQuestao_Pai: 1 },
    ];

    const groups = siblingOrder(rows);
    expect(groups.get(null)).toHaveLength(1);
    expect(groups.get(1)).toHaveLength(2);
  });
});

describe("escalas do legado", () => {
  it("dificuldade é 0 · 2 · 5 · 7 · 10", () => {
    expect(mapDifficulty(7)).toEqual({ difficulty: 7, coerced: false });
    expect(mapDifficulty(0)).toEqual({ difficulty: 0, coerced: false });
    expect(mapDifficulty(10).difficulty).toBe(10);
  });

  it("valor fora da escala vira o meio, e **avisa** que foi coagido", () => {
    // Não falha: dificuldade estranha não invalida a questão. Mas é perda, e perda entra no
    // relatório.
    expect(mapDifficulty(3)).toEqual({ difficulty: 5, coerced: true });
    expect(mapDifficulty(null)).toEqual({ difficulty: 5, coerced: true });
  });

  it("numeração: 0 arábica, 13 romana, 27 letras", () => {
    expect(mapNumbering(0)).toBe("ARABIC");
    expect(mapNumbering(13)).toBe("ROMAN");
    expect(mapNumbering(27)).toBe("LETTER");
    expect(mapNumbering(99)).toBe("ARABIC");
  });
});

describe("classificação de arquivos", () => {
  it("fonte de figura é reconhecida pelo gerador", () => {
    // 318 gnuplot, 316 `.table`, 169 PGF: guardá-los como anexo genérico perderia a informação de
    // que existe um gerador — que é o que permite recompilar a figura depois.
    expect(classifyAsset("pub1/q2/grafico.gnuplot")?.kind).toBe("FIGURE_SOURCE_GNUPLOT");
    expect(classifyAsset("dados.table")?.kind).toBe("FIGURE_SOURCE_GNUPLOT_DATA");
    expect(classifyAsset("fig.ggb")?.kind).toBe("FIGURE_SOURCE_GEOGEBRA");
    expect(classifyAsset("desenho.asy")?.kind).toBe("FIGURE_SOURCE_ASYMPTOTE");
  });

  it("`preview.png` **não** é importado — é cache de render", () => {
    // Trazê-lo faria o produto carregar imagens que ele mesmo regenera, desatualizadas na
    // primeira edição.
    expect(classifyAsset("pub1/idQuestion7/preview.png")).toBeNull();
  });

  it("capa e metadados da publicação têm tipo próprio", () => {
    expect(classifyAsset("pub3/cover.jpg")?.kind).toBe("COVER");
    expect(classifyAsset("pub3/Álgebra Linear.detail.json")?.kind).toBe("PUBLICATION_METADATA");
  });

  it("o que não é reconhecido vira anexo **e é reportado**", () => {
    // Um `.knd` que ninguém previu precisa aparecer no relatório para virar decisão, não sumir
    // por falta de `case`.
    const classification = classifyAsset("config.knd");

    expect(classification?.kind).toBe("ATTACHMENT");
    expect(classification?.unclassified).toBe(true);
  });

  it("imagem final é imagem, não fonte de figura", () => {
    expect(classifyAsset("foto.jpg")).toEqual({ kind: "IMAGE", unclassified: false });
  });
});

describe("as quatro invariantes", () => {
  const node = (id: number, tipo: number, pai: number | null = null) => ({
    IdQuestao: id,
    IdQuestao_Pai: pai,
    TipoQuestao: tipo,
  });

  it("acervo íntegro não gera violação nenhuma", () => {
    const violations = checkInvariants({
      nodes: [node(1, -10), node(2, 2, 1), node(3, 1, 1)],
      options: [
        { IdQuestao: 2, Correta: 1 },
        { IdQuestao: 2, Correta: 0 },
      ],
    });

    expect(violations).toEqual([]);
  });

  it("1 — múltipla escolha sem gabarito é violação", () => {
    // O levantamento achou 230 corretas para 230 questões. Assumir isso passaria batido no dia em
    // que alguém restaurasse um backup pela metade.
    const violations = checkInvariants({ nodes: [node(2, 2)], options: [] });

    expect(violations[0]?.invariant).toBe(1);
    expect(violations[0]?.legacyIds).toEqual([2]);
  });

  it("1 — duas corretas na mesma questão é violação", () => {
    const violations = checkInvariants({
      nodes: [node(2, 2)],
      options: [
        { IdQuestao: 2, Correta: 1 },
        { IdQuestao: 2, Correta: true },
      ],
    });

    expect(violations[0]?.message).toMatch(/mais de uma/);
  });

  it("1 — discursiva sem alternativa **não** é violação", () => {
    expect(checkInvariants({ nodes: [node(3, 1)], options: [] })).toEqual([]);
  });

  it("2 — pai inexistente é violação", () => {
    const violations = checkInvariants({ nodes: [node(2, 1, 999)], options: [] });

    expect(violations[0]?.invariant).toBe(2);
    expect(violations[0]?.legacyIds).toEqual([2]);
  });

  it("3 — ciclo na árvore é violação", () => {
    const violations = checkInvariants({
      nodes: [node(1, -10, 2), node(2, -9, 1)],
      options: [],
    });

    expect(violations.some((entry) => entry.invariant === 3)).toBe(true);
  });

  it("todas as violações vêm juntas, não uma por execução", () => {
    // Quem vai investigar o acervo de origem prefere a lista inteira.
    const violations = checkInvariants({
      nodes: [node(2, 2), node(3, 1, 999)],
      options: [],
    });

    expect(violations.map((entry) => entry.invariant).sort()).toEqual([1, 2]);
  });

  it("4 — segunda execução que cria algo é violação de idempotência", () => {
    // Duplicatas silenciosas são piores que falha: o acervo passa a ter duas cópias de cada
    // questão sem nenhum aviso.
    expect(() => assertIdempotent({ created: 0, matched: 297 })).not.toThrow();
    expect(() => assertIdempotent({ created: 3, matched: 294 })).toThrow(ImportInvariantError);
  });

  it("a mensagem de erro lista as invariantes violadas", () => {
    try {
      assertIdempotent({ created: 1, matched: 0 });
      expect.unreachable("deveria ter falhado");
    } catch (error) {
      expect((error as ImportInvariantError).message).toMatch(/idempotente/);
      expect((error as ImportInvariantError).violations[0]?.invariant).toBe(4);
    }
  });
});

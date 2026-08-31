import { describe, expect, it } from "vitest";

import { mapLegacyLibrary } from "@modules/legacy-import/application/map-legacy-library";
import type {
  LegacyLibraryContents,
  RawLegacyOptionRow,
  RawLegacyPublicationRow,
  RawLegacyQuestionRow,
} from "@modules/legacy-import/domain/legacy-library-reader";

/**
 * Uma biblioteca legada é uma **coleção** de livros — `Publication` é o livro de verdade (UUID,
 * ISBN), e `Questao.idPublication` liga cada questão a um deles. Confirmado por consulta
 * recursiva contra o acervo real (2026-08-31): uma subárvore inteira pertence a um único
 * `idPublication`, nunca mistura.
 */

const question = (over: Partial<RawLegacyQuestionRow> = {}): RawLegacyQuestionRow => ({
  IdQuestao: 1,
  IdQuestao_Pai: null,
  TipoQuestao: -10,
  idPublication: 1,
  Apelido: "Capítulo 1",
  latexQuestao: null,
  latexResposta: null,
  latexOrigin: null,
  Dificuldade: 5,
  Numeracao: 0,
  Numeracao_Original: 0,
  Ano: null,
  ...over,
});

const option = (over: Partial<RawLegacyOptionRow> = {}): RawLegacyOptionRow => ({
  IdQuestao_Itens: 1,
  IdQuestao: 1,
  Ordem: 1,
  Marcacao: "a",
  Correta: 0,
  latexOrigin: null,
  latexItem: null,
  latexResposta: null,
  ...over,
});

const publication = (over: Partial<RawLegacyPublicationRow> = {}): RawLegacyPublicationRow => ({
  idPublication: 1,
  PublicationName: "Livro 1",
  UUID: null,
  ISBN: null,
  AuthorSort: null,
  PublicationNick: null,
  PublicationSeries: null,
  Notes: null,
  ...over,
});

const contents = (over: Partial<LegacyLibraryContents> = {}): LegacyLibraryContents => ({
  capabilities: {
    generation: "latex_complemento",
    hasComplemento: true,
    hasTagConhecimento: true,
    hasBanca: true,
    hasMigrationsTable: true,
  },
  publications: [publication()],
  questions: [question()],
  options: [],
  ...over,
});

const opts = { workspaceName: "Cálculo", workspaceSlug: "calculo" };

describe("mapLegacyLibrary — agrupamento por Publication", () => {
  it("uma biblioteca com um só livro vira um workspace com uma publicação", () => {
    const mapping = mapLegacyLibrary(contents(), opts);

    expect(mapping.portable.publications).toHaveLength(1);
    expect(mapping.portable.publications[0]?.title).toBe("Livro 1");
    expect(mapping.portable.publications[0]?.legacyId).toBe(1);
  });

  it("duas subárvores com idPublication diferente viram duas publicações", () => {
    const mapping = mapLegacyLibrary(
      contents({
        publications: [publication({ idPublication: 1 }), publication({ idPublication: 2, PublicationName: "Livro 2" })],
        questions: [
          question({ IdQuestao: 1, idPublication: 1 }),
          question({ IdQuestao: 2, idPublication: 2, Apelido: "Cap. do livro 2" }),
        ],
      }),
      opts,
    );

    expect(mapping.portable.publications).toHaveLength(2);
    const titles = mapping.portable.publications.map((p) => p.title).sort();
    expect(titles).toEqual(["Livro 1", "Livro 2"]);
  });

  it("nós de publicações diferentes não viram irmãos um do outro", () => {
    // Duas raízes (IdQuestao_Pai null) de livros diferentes não podem competir por sortKey juntas.
    const mapping = mapLegacyLibrary(
      contents({
        publications: [publication({ idPublication: 1 }), publication({ idPublication: 2 })],
        questions: [
          question({ IdQuestao: 1, idPublication: 1 }),
          question({ IdQuestao: 2, idPublication: 2 }),
        ],
      }),
      opts,
    );

    for (const pub of mapping.portable.publications) {
      expect(pub.nodes).toHaveLength(1);
    }
  });

  it("questão com idPublication que não existe em Publication é reportada, não descartada", () => {
    const mapping = mapLegacyLibrary(
      contents({
        publications: [publication({ idPublication: 1 })],
        questions: [question({ IdQuestao: 9, idPublication: 999 })],
      }),
      opts,
    );

    expect(mapping.orphanPublicationRefs).toEqual([{ legacyQuestionId: 9, idPublication: 999 }]);
    // Mesmo órfã de Publication, a questão ainda entra — vira `PortablePublication` sintética.
    expect(mapping.portable.publications.some((p) => p.legacyId === 999)).toBe(true);
  });

  it("UUID vira legacyUuid, em minúsculas", () => {
    const mapping = mapLegacyLibrary(
      contents({ publications: [publication({ UUID: "ABC-123" })] }),
      opts,
    );

    expect(mapping.portable.publications[0]?.legacyUuid).toBe("abc-123");
  });

  it("ISBN vazio vira null, não string vazia", () => {
    const mapping = mapLegacyLibrary(contents({ publications: [publication({ ISBN: "" })] }), opts);

    expect(mapping.portable.publications[0]?.isbn).toBeNull();
  });
});

describe("mapLegacyLibrary — questão e alternativas", () => {
  it("questão de múltipla escolha carrega enunciado, resolução e alternativas", () => {
    const mapping = mapLegacyLibrary(
      contents({
        questions: [
          question({ IdQuestao: 1, TipoQuestao: 2, latexQuestao: "2+2=?", latexResposta: "É 4." }),
        ],
        options: [
          option({ IdQuestao: 1, IdQuestao_Itens: 10, Marcacao: "a", Correta: 0, latexItem: "3" }),
          option({ IdQuestao: 1, IdQuestao_Itens: 11, Marcacao: "b", Correta: 1, latexItem: "4" }),
        ],
      }),
      opts,
    );

    const node = mapping.portable.publications[0]?.nodes[0];
    expect(node?.question?.statementLatex).toBe("2+2=?");
    expect(node?.question?.solutionLatex).toBe("É 4.");
    expect(node?.question?.options).toHaveLength(2);
    expect(node?.question?.options.find((o) => o.legacyId === 11)?.isCorrect).toBe(true);
    expect(node?.question?.options.find((o) => o.legacyId === 11)?.legacyMarcacao).toBe("b");
  });

  it("nó estrutural (capítulo) não tem `question`, e o título vem do Apelido", () => {
    const mapping = mapLegacyLibrary(
      contents({ questions: [question({ TipoQuestao: -10, Apelido: "Capítulo 1" })] }),
      opts,
    );

    const node = mapping.portable.publications[0]?.nodes[0];
    expect(node?.question).toBeNull();
    expect(node?.title).toBe("Capítulo 1");
  });

  it("questão usa Apelido como nickname, não como título do nó", () => {
    const mapping = mapLegacyLibrary(
      contents({ questions: [question({ TipoQuestao: 1, Apelido: "CESGRANRIO – 2015" })] }),
      opts,
    );

    const node = mapping.portable.publications[0]?.nodes[0];
    expect(node?.title).toBeNull();
    expect(node?.question?.nickname).toBe("CESGRANRIO – 2015");
  });

  it("banca, instituição, cargo e nível de cargo chegam à questão", () => {
    const mapping = mapLegacyLibrary(
      contents({
        questions: [
          question({
            TipoQuestao: 1,
            Banca: "Cesgranrio",
            ["Instituição"]: "Caixa",
            Cargo: "Técnico",
            Nivel_Cargo: "Médio",
          }),
        ],
      }),
      opts,
    );

    const question_ = mapping.portable.publications[0]?.nodes[0]?.question;
    expect(question_?.board).toBe("Cesgranrio");
    expect(question_?.institution).toBe("Caixa");
    expect(question_?.role).toBe("Técnico");
    expect(question_?.roleLevel).toBe("Médio");
  });

  it("latexOrigin da questão vira originalLatex", () => {
    const mapping = mapLegacyLibrary(
      contents({ questions: [question({ TipoQuestao: 1, latexOrigin: "fonte original" })] }),
      opts,
    );

    expect(mapping.portable.publications[0]?.nodes[0]?.question?.originalLatex).toBe(
      "fonte original",
    );
  });

  it("dificuldade fora da escala é coagida e reportada", () => {
    const mapping = mapLegacyLibrary(
      contents({ questions: [question({ IdQuestao: 42, TipoQuestao: 1, Dificuldade: 3 })] }),
      opts,
    );

    expect(mapping.coercedDifficulty).toEqual([42]);
    expect(mapping.portable.publications[0]?.nodes[0]?.question?.difficulty).toBe(5);
  });
});

describe("mapLegacyLibrary — exclusão por invariante (decisão de 2026-08-31)", () => {
  it("questão sem gabarito é excluída, não derruba a biblioteca inteira", () => {
    const mapping = mapLegacyLibrary(
      contents({
        questions: [
          question({ IdQuestao: 1, TipoQuestao: 2 }),
          question({ IdQuestao: 2, TipoQuestao: 2 }),
        ],
        options: [option({ IdQuestao: 1, Correta: 1 })],
      }),
      opts,
    );

    expect(mapping.excluded).toEqual([
      { legacyId: 2, reason: expect.stringContaining("sem alternativa correta") },
    ]);
    const remainingIds = mapping.portable.publications[0]?.nodes.map((n) => n.legacyId);
    expect(remainingIds).toEqual([1]);
  });

  it("tipo desconhecido também é excluído e reportado, não derruba nada", () => {
    const mapping = mapLegacyLibrary(
      contents({
        questions: [question({ IdQuestao: 1 }), question({ IdQuestao: 2, TipoQuestao: 42 })],
      }),
      opts,
    );

    expect(mapping.excluded.some((e) => e.legacyId === 2)).toBe(true);
    expect(mapping.portable.publications[0]?.nodes.map((n) => n.legacyId)).toEqual([1]);
  });

  it("filho de nó excluído recusa a importação em vez de gravar árvore quebrada", () => {
    expect(() =>
      mapLegacyLibrary(
        contents({
          questions: [
            question({ IdQuestao: 1, TipoQuestao: 42 }),
            question({ IdQuestao: 2, IdQuestao_Pai: 1, TipoQuestao: -9 }),
          ],
        }),
        opts,
      ),
    ).toThrow(/excluíd/);
  });
});

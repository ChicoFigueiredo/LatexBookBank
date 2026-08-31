import { describe, expect, it } from "vitest";

import { auditLegacyLibrary } from "@modules/legacy-import/application/audit-legacy-library";
import type {
  LegacyLibraryContents,
  LegacyLibraryReader,
  RawLegacyOptionRow,
  RawLegacyQuestionRow,
} from "@modules/legacy-import/domain/legacy-library-reader";

const question = (over: Partial<RawLegacyQuestionRow> = {}): RawLegacyQuestionRow => ({
  IdQuestao: 1,
  IdQuestao_Pai: null,
  TipoQuestao: -10,
  Apelido: "Capítulo 1",
  latexQuestao: null,
  latexResposta: null,
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

const fakeReader = (contents: Omit<LegacyLibraryContents, "capabilities">): LegacyLibraryReader => ({
  read: async () => ({
    capabilities: {
      generation: "latex_complemento",
      hasComplemento: true,
      hasTagConhecimento: true,
      hasBanca: true,
      hasMigrationsTable: true,
    },
    ...contents,
  }),
});

describe("auditLegacyLibrary", () => {
  it("conta questões e alternativas", async () => {
    const audit = await auditLegacyLibrary(
      fakeReader({
        questions: [question({ IdQuestao: 1 }), question({ IdQuestao: 2, TipoQuestao: 2 })],
        options: [option({ IdQuestao: 2 }), option({ IdQuestao: 2, IdQuestao_Itens: 2 })],
      }),
    );

    expect(audit.counts).toEqual({ questions: 2, options: 2 });
  });

  it("acervo íntegro não gera violação nenhuma", async () => {
    const audit = await auditLegacyLibrary(
      fakeReader({
        questions: [question({ IdQuestao: 1 }), question({ IdQuestao: 2, TipoQuestao: 2, IdQuestao_Pai: 1 })],
        options: [
          option({ IdQuestao: 2, Correta: 1 }),
          option({ IdQuestao: 2, IdQuestao_Itens: 2, Correta: 0 }),
        ],
      }),
    );

    expect(audit.violations).toEqual([]);
  });

  it("propaga violação de gabarito ausente, com o id legado real", async () => {
    const audit = await auditLegacyLibrary(
      fakeReader({
        questions: [question({ IdQuestao: 7, TipoQuestao: 2 })],
        options: [],
      }),
    );

    expect(audit.violations).toHaveLength(1);
    expect(audit.violations[0]?.legacyIds).toEqual([7]);
  });

  it("propaga violação de pai inexistente", async () => {
    const audit = await auditLegacyLibrary(
      fakeReader({
        questions: [question({ IdQuestao: 3, TipoQuestao: 1, IdQuestao_Pai: 999 })],
        options: [],
      }),
    );

    expect(audit.violations.some((v) => v.invariant === 2)).toBe(true);
  });
});

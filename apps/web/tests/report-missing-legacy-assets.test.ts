import { describe, expect, it } from "vitest";

import { reportMissingLegacyAssets } from "@modules/legacy-import/application/report-missing-legacy-assets";
import type { LegacyFsProbe } from "@modules/legacy-import/domain/legacy-config";
import type {
  LegacyLibraryContents,
  RawLegacyOptionRow,
  RawLegacyQuestionRow,
} from "@modules/legacy-import/domain/legacy-library-reader";

const question = (over: Partial<RawLegacyQuestionRow> = {}): RawLegacyQuestionRow => ({
  IdQuestao: 1,
  IdQuestao_Pai: null,
  TipoQuestao: 2,
  idPublication: 1,
  Apelido: null,
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

const contents = (
  questions: readonly RawLegacyQuestionRow[],
  options: readonly RawLegacyOptionRow[] = [],
): LegacyLibraryContents => ({
  capabilities: {
    generation: "latex_complemento",
    hasComplemento: true,
    hasTagConhecimento: true,
    hasBanca: true,
    hasMigrationsTable: true,
  },
  publications: [],
  questions,
  options,
});

/** Probe de mentira: só os caminhos listados existem. `listTopLevelDirectories` não é usado aqui. */
const fakeProbe = (existing: readonly string[]): LegacyFsProbe => {
  const set = new Set(existing);
  return {
    exists: async (path) => set.has(path),
    listTopLevelDirectories: async () => [],
  };
};

const LIB = "/acervo/Prof-Mat";
const options = { libraryDir: LIB };

describe("reportMissingLegacyAssets", () => {
  it("resolve a referência contra a pasta da questão e não reporta nada quando o arquivo está lá", async () => {
    const report = await reportMissingLegacyAssets(
      contents([
        question({
          IdQuestao: 9,
          idPublication: 8,
          latexQuestao: "\\includegraphics[width=0.75\\linewidth]{images/clipboard_a.png}",
        }),
      ]),
      fakeProbe([`${LIB}/pub0000000008/idQuestion9/images/clipboard_a.png`]),
      options,
    );

    expect(report.refs).toBe(1);
    expect(report.questionsWithRefs).toBe(1);
    expect(report.missing).toEqual([]);
  });

  it("reporta a referência sem arquivo, dizendo onde procurou", async () => {
    const report = await reportMissingLegacyAssets(
      contents([
        question({
          IdQuestao: 9,
          idPublication: 8,
          latexResposta: "\\includegraphics{images/sumiu.png}",
        }),
      ]),
      fakeProbe([]),
      options,
    );

    expect(report.missing).toEqual([
      {
        legacyQuestionId: 9,
        idPublication: 8,
        field: "latexResposta",
        ref: "images/sumiu.png",
        expectedPath: `${LIB}/pub0000000008/idQuestion9/images/sumiu.png`,
        reason: "arquivo-ausente",
      },
    ]);
  });

  it("ancora a figura da alternativa na pasta da questão dona, não na da alternativa", async () => {
    const report = await reportMissingLegacyAssets(
      contents(
        [question({ IdQuestao: 10, idPublication: 1 })],
        [
          option({
            IdQuestao_Itens: 6,
            IdQuestao: 10,
            latexResposta: "\\includegraphics{images/item.png}",
          }),
        ],
      ),
      fakeProbe([]),
      options,
    );

    expect(report.missing[0]).toMatchObject({
      legacyQuestionId: 10,
      expectedPath: `${LIB}/pub0000000001/idQuestion10/images/item.png`,
      field: "Questao_Itens.6.latexResposta",
    });
  });

  it("a mesma figura citada duas vezes na questão vira uma linha só", async () => {
    const report = await reportMissingLegacyAssets(
      contents([
        question({
          IdQuestao: 3,
          idPublication: 1,
          latexQuestao: "\\includegraphics{images/fig.png}",
          latexResposta: "\\includegraphics{./images/fig.png}",
        }),
      ]),
      fakeProbe([]),
      options,
    );

    expect(report.refs).toBe(1);
    expect(report.missing).toHaveLength(1);
    expect(report.missing[0]?.field).toBe("latexQuestao");
  });

  it("referência sem extensão tenta as extensões que o graphicx tentaria", async () => {
    const report = await reportMissingLegacyAssets(
      contents([
        question({ IdQuestao: 4, idPublication: 1, latexQuestao: "\\includegraphics{images/fig}" }),
      ]),
      fakeProbe([`${LIB}/pub0000000001/idQuestion4/images/fig.pdf`]),
      options,
    );

    expect(report.missing).toEqual([]);
  });

  it("caminho que sai da pasta da questão é reportado como tal, sem ir ao disco", async () => {
    let probed = 0;
    const probe: LegacyFsProbe = {
      exists: async () => {
        probed += 1;
        return true;
      },
      listTopLevelDirectories: async () => [],
    };

    const report = await reportMissingLegacyAssets(
      contents([
        question({
          IdQuestao: 5,
          idPublication: 1,
          latexQuestao: "\\includegraphics{../idQuestion7/images/fig.png}",
        }),
      ]),
      probe,
      options,
    );

    expect(probed).toBe(0);
    expect(report.missing[0]).toMatchObject({
      ref: "../idQuestion7/images/fig.png",
      reason: "caminho-escapa-da-pasta",
      expectedPath: null,
    });
  });

  it("alternativa órfã não some em silêncio — sem a questão dona não há pasta para procurar", async () => {
    const report = await reportMissingLegacyAssets(
      contents(
        [],
        [option({ IdQuestao_Itens: 2, IdQuestao: 99, latexItem: "\\includegraphics{a.png}" })],
      ),
      fakeProbe([]),
      options,
    );

    expect(report.missing[0]).toMatchObject({
      legacyQuestionId: 99,
      idPublication: null,
      expectedPath: null,
      reason: "questao-dona-desconhecida",
    });
  });

  it("biblioteca sem nenhuma citação de arquivo devolve relatório vazio, não erro", async () => {
    const report = await reportMissingLegacyAssets(
      contents([question({ IdQuestao: 1, latexQuestao: "Quanto é $2+2$?" })]),
      fakeProbe([]),
      options,
    );

    expect(report).toEqual({
      libraryDir: LIB,
      refs: 0,
      questionsWithRefs: 0,
      missing: [],
    });
  });

  it("ordena por questão e depois por referência, para o relatório sair estável", async () => {
    const report = await reportMissingLegacyAssets(
      contents([
        question({
          IdQuestao: 20,
          idPublication: 1,
          latexQuestao: "\\includegraphics{b.png}\\includegraphics{a.png}",
        }),
        question({ IdQuestao: 2, idPublication: 1, latexQuestao: "\\includegraphics{c.png}" }),
      ]),
      fakeProbe([]),
      options,
    );

    expect(report.missing.map((entry) => [entry.legacyQuestionId, entry.ref])).toEqual([
      [2, "c.png"],
      [20, "a.png"],
      [20, "b.png"],
    ]);
  });
});

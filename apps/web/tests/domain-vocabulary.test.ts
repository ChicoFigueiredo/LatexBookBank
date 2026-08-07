import { describe, expect, it } from "vitest";

import {
  assetKindFromExtension,
  isDerivedAsset,
  isSourceAsset,
} from "@modules/assets/domain/asset-kind";
import { nodeKindFromLegacy } from "@modules/document-tree/domain/node-kind";
import {
  DIFFICULTIES,
  isDifficulty,
  LEGACY_TIPO_QUESTAO_TO_TYPE,
  optionLabelAt,
} from "@modules/questions/domain/question-type";

/**
 * O SQLite não suporta `enum`, então as colunas são `String` e o vocabulário fechado vive em
 * TypeScript. Isso só é seguro se as conversões forem testadas — em especial as que traduzem
 * o legado, onde um mapeamento errado corrompe o acervo em silêncio.
 */

describe("TipoQuestao legado → NodeKind", () => {
  it("trata o sinal como discriminador: negativo é estrutura", () => {
    expect(nodeKindFromLegacy(-10)).toBe("CHAPTER");
    expect(nodeKindFromLegacy(-9)).toBe("SECTION");
    expect(nodeKindFromLegacy(-8)).toBe("SUBSECTION");
    expect(nodeKindFromLegacy(-7)).toBe("SUBSECTION");
    expect(nodeKindFromLegacy(-1)).toBe("QUESTION_GROUP");
  });

  it("positivo é questão", () => {
    expect(nodeKindFromLegacy(1)).toBe("QUESTION");
    expect(nodeKindFromLegacy(2)).toBe("QUESTION");
    expect(nodeKindFromLegacy(7)).toBe("QUESTION");
  });

  it("negativo desconhecido vira CONTENT em vez de quebrar", () => {
    expect(nodeKindFromLegacy(-99)).toBe("CONTENT");
  });
});

describe("TipoQuestao legado → QuestionType", () => {
  it("mapeia os dois tipos com dados no acervo", () => {
    expect(LEGACY_TIPO_QUESTAO_TO_TYPE[1]).toBe("DISCURSIVE");
    expect(LEGACY_TIPO_QUESTAO_TO_TYPE[2]).toBe("MULTIPLE_CHOICE");
  });

  it("mapeia também os tipos sem dados, para o import não descartá-los", () => {
    // 3–7 têm zero linhas hoje. Se aparecerem, precisam falhar ruidosamente — não sumir.
    expect(LEGACY_TIPO_QUESTAO_TO_TYPE[5]).toBe("CESPE");
    expect(LEGACY_TIPO_QUESTAO_TO_TYPE[7]).toBe("SUM_OF_CORRECT");
  });
});

describe("escala de dificuldade", () => {
  it("é a legada 0·2·5·7·10, não 1–5", () => {
    expect([...DIFFICULTIES]).toEqual([0, 2, 5, 7, 10]);
  });

  it("recusa valores fora da escala", () => {
    expect(isDifficulty(0)).toBe(true);
    expect(isDifficulty(10)).toBe(true);
    expect(isDifficulty(1)).toBe(false);
    expect(isDifficulty(3)).toBe(false);
  });
});

describe("letra da alternativa é projeção da ordem", () => {
  it("deriva da posição, não de campo persistido", () => {
    expect(optionLabelAt(0)).toBe("a");
    expect(optionLabelAt(4)).toBe("e");
    expect(optionLabelAt(25)).toBe("z");
  });

  it("não quebra além de 26 alternativas", () => {
    // O domínio não fixa 5 alternativas (spec §9), então a projeção precisa continuar.
    expect(optionLabelAt(26)).toBe("aa");
    expect(optionLabelAt(27)).toBe("ab");
  });

  it("recusa índice negativo", () => {
    expect(() => optionLabelAt(-1)).toThrow(RangeError);
  });
});

describe("classificação de assets por extensão", () => {
  it("reconhece as fontes de figura do acervo real", () => {
    expect(assetKindFromExtension("grafico.gnuplot")).toBe("FIGURE_SOURCE_GNUPLOT");
    expect(assetKindFromExtension("curva.pgf")).toBe("FIGURE_SOURCE_PGF");
    expect(assetKindFromExtension("construcao.ggb")).toBe("FIGURE_SOURCE_GEOGEBRA");
    expect(assetKindFromExtension("desenho.asy")).toBe("FIGURE_SOURCE_ASYMPTOTE");
    expect(assetKindFromExtension("figura.tpx")).toBe("FIGURE_SOURCE_TPX");
    expect(assetKindFromExtension("serie.table")).toBe("FIGURE_DATA_TABLE");
  });

  it("é insensível a caixa", () => {
    expect(assetKindFromExtension("PROVA.PDF")).toBe("SOURCE_PDF");
  });

  it("cai em ATTACHMENT quando não reconhece — nada é descartado", () => {
    expect(assetKindFromExtension("estranho.xyz")).toBe("ATTACHMENT");
    expect(assetKindFromExtension("sem-extensao")).toBe("ATTACHMENT");
  });
});

describe("fonte × derivado têm políticas de retenção distintas", () => {
  it("fontes são patrimônio", () => {
    expect(isSourceAsset("SOURCE_PDF")).toBe(true);
    expect(isSourceAsset("CROP")).toBe(true);
    expect(isSourceAsset("FIGURE_SOURCE_GNUPLOT")).toBe(true);
  });

  it("renders são reconstruíveis", () => {
    expect(isDerivedAsset("RENDER_PDF")).toBe(true);
    expect(isDerivedAsset("RENDER_PNG")).toBe(true);
    // O PNG de render nunca é fonte da questão (spec §1.1) — no legado, `preview.png` era cache.
    expect(isSourceAsset("RENDER_PNG")).toBe(false);
  });
});

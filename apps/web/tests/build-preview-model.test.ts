import { describe, expect, it } from "vitest";

import {
  buildPreviewModel,
  optionLetter,
  type PreviewSource,
} from "@modules/preview/domain/build-preview-model";
import { PREVIEW_DISCLAIMER } from "@modules/preview/domain/preview-model";

const source = (over: Partial<PreviewSource> = {}): PreviewSource => ({
  statementLatex: "",
  solutionLatex: "",
  complementLatex: "",
  options: [],
  ...over,
});

describe("optionLetter", () => {
  it("é derivada da posição, nunca guardada", () => {
    // D9: no legado a letra vivia na linha, e reordenar alternativas deixava o gabarito
    // apontando para a letra errada. Como função do índice, não há o que ficar inconsistente.
    expect([0, 1, 2, 3, 4].map(optionLetter)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("não repete a letra depois da vigésima sexta", () => {
    expect(optionLetter(25)).toBe("z");
    expect(optionLetter(26)).toBe("aa");
    expect(optionLetter(27)).toBe("ab");
  });
});

describe("buildPreviewModel", () => {
  it("separa os quatro campos do agregado", () => {
    const model = buildPreviewModel(
      source({
        statementLatex: "Enunciado",
        solutionLatex: "Resposta",
        complementLatex: "Complemento",
      }),
    );

    expect(model.statement).toHaveLength(1);
    expect(model.solution).toHaveLength(1);
    expect(model.complement).toHaveLength(1);
  });

  it("numera as alternativas na ordem recebida", () => {
    const model = buildPreviewModel(
      source({
        options: [
          { statementLatex: "primeira", isCorrect: false },
          { statementLatex: "segunda", isCorrect: true },
        ],
      }),
    );

    expect(model.options.map((option) => option.letter)).toEqual(["a", "b"]);
    expect(model.options[1]?.isCorrect).toBe(true);
  });

  it("campo vazio não vira bloco", () => {
    // Um parágrafo vazio abriria espaço em branco na tela para um campo que ninguém preencheu.
    expect(buildPreviewModel(source()).statement).toEqual([]);
  });

  it("cada alternativa passa pelo mesmo leitor do enunciado", () => {
    const model = buildPreviewModel(
      source({ options: [{ statementLatex: "vale $x^2$", isCorrect: false }] }),
    );
    const [block] = model.options[0]?.blocks ?? [];

    expect(block?.kind).toBe("paragraph");
    expect(block?.kind === "paragraph" && block.inlines.some((i) => i.kind === "math")).toBe(true);
  });
});

describe("aviso da spec §11", () => {
  it("é uma constante, não um literal solto na tela", () => {
    expect(PREVIEW_DISCLAIMER).toBe("Preview rápido — pode diferir do PDF final.");
  });
});

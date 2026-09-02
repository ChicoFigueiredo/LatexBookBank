import { describe, expect, it } from "vitest";

import {
  extractLegacyAssetRefs,
  legacyQuestionAssetDir,
} from "@modules/legacy-import/domain/legacy-asset-refs";

describe("extractLegacyAssetRefs", () => {
  it("lê o formato que o acervo real gravou — opções entre colchetes e `\\r` do editor", () => {
    const refs = extractLegacyAssetRefs([
      {
        field: "latexQuestao",
        latex:
          "\\includegraphics[width=0.95\\linewidth]{images/clipboard_2024.03.16.23.47.525938.png}\r",
      },
    ]);

    expect(refs).toEqual([
      {
        field: "latexQuestao",
        command: "includegraphics",
        raw: "images/clipboard_2024.03.16.23.47.525938.png",
        relativePath: "images/clipboard_2024.03.16.23.47.525938.png",
        escapesQuestionDir: false,
      },
    ]);
  });

  it("acha as três figuras de um `figure` multilinha, como na Fundamentos id=11", () => {
    const refs = extractLegacyAssetRefs([
      {
        field: "latexResposta",
        latex: [
          "Se A, B e C são colineares...",
          "\\begin{figure}[]",
          "     \\centering",
          "     \\includegraphics[width=0.95\\linewidth]{images/clipboard_2023.10.12.22.30.227185.png}\r",
          "     \\includegraphics[width=0.95\\linewidth]{images/clipboard_2023.10.12.22.31.498935.png}\r",
          "     \\includegraphics[width=0.95\\linewidth]{images/clipboard_2023.10.12.22.32.398401.png}",
          "\\end{figure}",
        ].join("\n"),
      },
    ]);

    expect(refs.map((ref) => ref.relativePath)).toEqual([
      "images/clipboard_2023.10.12.22.30.227185.png",
      "images/clipboard_2023.10.12.22.31.498935.png",
      "images/clipboard_2023.10.12.22.32.398401.png",
    ]);
  });

  it("aceita o comando sem opções e a variante estrelada", () => {
    const refs = extractLegacyAssetRefs([
      { field: "latexQuestao", latex: "\\includegraphics{fig.png} \\includegraphics*{outra.png}" },
    ]);

    expect(refs.map((ref) => ref.relativePath)).toEqual(["fig.png", "outra.png"]);
  });

  it("também conta `\\includepdf`, que cita arquivo tanto quanto a figura", () => {
    const refs = extractLegacyAssetRefs([
      { field: "latexComplemento", latex: "\\includepdf[pages=-]{prova.pdf}" },
    ]);

    expect(refs[0]).toMatchObject({ command: "includepdf", relativePath: "prova.pdf" });
  });

  it("ignora `\\input` e `\\include` — citam preâmbulo, não asset", () => {
    const refs = extractLegacyAssetRefs([
      { field: "latexQuestao", latex: "\\input{amsmath}\n\\include{cap1}" },
    ]);

    expect(refs).toEqual([]);
  });

  it("ignora figura comentada — `%` não compila, então não falta arquivo nenhum", () => {
    const refs = extractLegacyAssetRefs([
      {
        field: "latexResposta",
        latex: "% \\includegraphics{antiga.png}\n\\includegraphics{atual.png}\n50\\% \\includegraphics{escapado.png}",
      },
    ]);

    expect(refs.map((ref) => ref.relativePath)).toEqual(["atual.png", "escapado.png"]);
  });

  it("normaliza barra invertida do Windows e `./` para um caminho POSIX só", () => {
    const refs = extractLegacyAssetRefs([
      { field: "latexQuestao", latex: "\\includegraphics{images\\fig.png}\\includegraphics{ ./outra.png }" },
    ]);

    expect(refs.map((ref) => ref.relativePath)).toEqual(["images/fig.png", "outra.png"]);
    expect(refs[0]?.raw).toBe("images\\fig.png");
  });

  it("marca caminho que sai da pasta da questão em vez de fingir que resolve", () => {
    const refs = extractLegacyAssetRefs([
      {
        field: "latexQuestao",
        latex:
          "\\includegraphics{../idQuestion7/images/fig.png}\\includegraphics{/etc/fig.png}\\includegraphics{C:\\temp\\fig.png}",
      },
    ]);

    expect(refs.map((ref) => ref.escapesQuestionDir)).toEqual([true, true, true]);
  });

  it("descarta chave vazia e campo nulo em vez de gerar referência fantasma", () => {
    const refs = extractLegacyAssetRefs([
      { field: "latexQuestao", latex: "\\includegraphics{}\\includegraphics{   }" },
      { field: "latexResposta", latex: null },
    ]);

    expect(refs).toEqual([]);
  });

  it("preserva a ordem e o campo de origem de cada referência", () => {
    const refs = extractLegacyAssetRefs([
      { field: "latexQuestao", latex: "\\includegraphics{a.png}" },
      { field: "latexResposta", latex: "\\includegraphics{b.png}" },
    ]);

    expect(refs.map((ref) => [ref.field, ref.relativePath])).toEqual([
      ["latexQuestao", "a.png"],
      ["latexResposta", "b.png"],
    ]);
  });
});

describe("legacyQuestionAssetDir", () => {
  it("monta a pasta como o acervo grava — `pub` com dez dígitos, `idQuestion` sem", () => {
    expect(legacyQuestionAssetDir(8, 9)).toBe("pub0000000008/idQuestion9");
    expect(legacyQuestionAssetDir(2, 198)).toBe("pub0000000002/idQuestion198");
  });
});

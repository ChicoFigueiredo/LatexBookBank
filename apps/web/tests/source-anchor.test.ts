import { describe, expect, it } from "vitest";

import {
  describeProvenance,
  InvalidAnchorError,
  normalizeAnchor,
  normalizedBoxFrom,
  pixelRectFor,
} from "@modules/assets/domain/source-anchor";
import {
  assertAcceptable,
  extensionOf,
  figureSnippet,
  MAX_UPLOAD_BYTES,
  sanitizeFilename,
  UploadRejectedError,
} from "@modules/assets/domain/asset-ingestion";

/**
 * **Nenhuma coordenada absoluta é persistida** (D28).
 *
 * Um retângulo em pixels só significa alguma coisa junto do DPI em que foi medido. Guardá-lo
 * assim transforma "onde a questão estava na página" em "onde ela estava naquela renderização", e
 * a próxima, em outro zoom, aponta para outro lugar.
 *
 * Verificado contra `pdftocairo` de verdade: a mesma caixa normalizada recortou o **mesmo
 * conteúdo** em 72, 150 e 300 DPI.
 */

const box = { x: 0.1, y: 0.24, width: 0.55, height: 0.06 };

describe("a caixa normalizada", () => {
  it("aceita o que está dentro da página", () => {
    const anchor = normalizeAnchor({ pageNumber: 3, box, rotation: null });

    expect(anchor.pageNumber).toBe(3);
    expect(anchor.box).toEqual(box);
  });

  it("**recusa** o que sai da página, em vez de aparar", () => {
    // Aparar devolveria um recorte diferente do que a pessoa viu, e a diferença só apareceria no
    // crop — quando já não dá para saber se o erro foi do desenho ou do código.
    const cases = [
      { ...box, x: -0.01 },
      { ...box, y: 0.98, height: 0.1 },
      { ...box, width: 1.5 },
    ];

    for (const bad of cases) {
      expect(() => normalizeAnchor({ pageNumber: 1, box: bad, rotation: null })).toThrow(
        InvalidAnchorError,
      );
    }
  });

  it("recusa recorte sem área", () => {
    expect(() =>
      normalizeAnchor({ pageNumber: 1, box: { ...box, width: 0 }, rotation: null }),
    ).toThrow(/maiores que zero/);
  });

  it("recusa página zero ou fracionária", () => {
    expect(() => normalizeAnchor({ pageNumber: 0, box, rotation: null })).toThrow(/a partir de 1/);
    expect(() => normalizeAnchor({ pageNumber: 1.5, box, rotation: null })).toThrow();
  });

  it("aceita só as quatro rotações que existem", () => {
    for (const rotation of [90, 180, 270]) {
      expect(normalizeAnchor({ pageNumber: 1, box, rotation }).rotation).toBe(rotation);
    }
    // `0` vira `null`: "sem rotação" é ausência, não um valor a comparar em toda leitura.
    expect(normalizeAnchor({ pageNumber: 1, box, rotation: 0 }).rotation).toBeNull();
    expect(() => normalizeAnchor({ pageNumber: 1, box, rotation: 45 })).toThrow();
  });

  it("arredonda para seis casas — dois desenhos iguais dão o mesmo valor", () => {
    // Sem isso, o `float` cru faria dois recortes idênticos gerarem hashes diferentes.
    const anchor = normalizeAnchor({
      pageNumber: 1,
      box: { x: 0.1000000001, y: 0.2, width: 0.3, height: 0.4 },
      rotation: null,
    });

    expect(anchor.box.x).toBe(0.1);
  });
});

describe("normalizado ↔ pixels", () => {
  const a4at150 = { width: 1241, height: 1754 };

  it("o mesmo recorte em DPIs diferentes cobre a mesma fração", () => {
    // Verificado com `pdftocairo`: a caixa `RECORTE ESTA CAIXA` saiu igual em 72, 150 e 300 DPI.
    const at72 = pixelRectFor(box, { width: 596, height: 842 });
    const at300 = pixelRectFor(box, { width: 2481, height: 3508 });

    expect(at72.x / 596).toBeCloseTo(at300.x / 2481, 2);
    expect(at72.width / 596).toBeCloseTo(at300.width / 2481, 2);
  });

  it("arredonda **para fora** — meio pixel a menos corta a serifa", () => {
    const rect = pixelRectFor({ x: 0.5, y: 0.5, width: 0.001, height: 0.001 }, a4at150);

    expect(rect.width).toBeGreaterThanOrEqual(1);
    expect(rect.height).toBeGreaterThanOrEqual(1);
  });

  it("nunca passa da borda da página", () => {
    const rect = pixelRectFor({ x: 0.99, y: 0.99, width: 0.01, height: 0.01 }, a4at150);

    expect(rect.x + rect.width).toBeLessThanOrEqual(a4at150.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(a4at150.height);
  });

  it("a volta a partir de pixels **contém** o retângulo original", () => {
    // É o caminho que a tela usa: a pessoa arrasta sobre uma imagem, e o que se guarda é a fração.
    //
    // Contém, e não é idêntico — a primeira versão deste teste exigia igualdade e falhava por um
    // pixel: `124/1241` arredondado a seis casas volta como `123,99…`, e o `floor` da origem cai
    // um pixel antes. Isso é o desenho funcionando, não um defeito: a origem arredonda para trás
    // e o tamanho para a frente **de propósito**, porque meio pixel a mais é invisível e meio
    // pixel a menos corta a serifa da primeira letra.
    const rect = { x: 124, y: 421, width: 683, height: 105 };
    const back = pixelRectFor(normalizedBoxFrom(rect, a4at150), a4at150);

    expect(back.x).toBeLessThanOrEqual(rect.x);
    expect(back.y).toBeLessThanOrEqual(rect.y);
    expect(back.x + back.width).toBeGreaterThanOrEqual(rect.x + rect.width);
    expect(back.y + back.height).toBeGreaterThanOrEqual(rect.y + rect.height);

    // E a deriva é de no máximo um pixel — cresce, nunca encolhe.
    expect(rect.x - back.x).toBeLessThanOrEqual(1);
    expect(back.width - rect.width).toBeLessThanOrEqual(2);
  });
});

describe("voltar à origem", () => {
  it("a proveniência diz arquivo, página e onde na página", () => {
    // Um crop sem essa cadeia é uma imagem órfã que ninguém consegue conferir contra a fonte.
    const text = describeProvenance({
      sourceFilename: "cesgranrio-2014.pdf",
      pageNumber: 12,
      box,
    });

    expect(text).toContain("cesgranrio-2014.pdf");
    expect(text).toContain("página 12");
    expect(text).toContain("10.0%");
  });

  it("fonte desconhecida não vira string vazia", () => {
    expect(describeProvenance({ sourceFilename: null, pageNumber: 1, box })).toContain(
      "fonte desconhecida",
    );
  });
});

describe("o que pode entrar", () => {
  const ok = { filename: "grafico.png", mimeType: "image/png", sizeBytes: 1024 };

  it("aceita o que está na lista", () => {
    expect(() => assertAcceptable(ok)).not.toThrow();
    expect(() =>
      assertAcceptable({ filename: "fonte.tex", mimeType: "text/plain", sizeBytes: 10 }),
    ).not.toThrow();
  });

  it("recusa MIME fora da lista fechada", () => {
    // Lista de permitidos e não de proibidos: uma de proibidos precisa prever o ataque.
    expect(() =>
      assertAcceptable({ ...ok, filename: "x.exe", mimeType: "application/x-msdownload" }),
    ).toThrow(UploadRejectedError);
  });

  it("recusa quando MIME e extensão **discordam**", () => {
    // Ou o arquivo foi renomeado, ou é outra coisa — e as duas pedem que alguém olhe.
    expect(() => assertAcceptable({ ...ok, filename: "grafico.pdf" })).toThrow(/não combina/);
  });

  it("recusa vazio e recusa grande demais", () => {
    expect(() => assertAcceptable({ ...ok, sizeBytes: 0 })).toThrow(/vazio/);
    expect(() => assertAcceptable({ ...ok, sizeBytes: MAX_UPLOAD_BYTES + 1 })).toThrow(/limite/);
  });

  it("extensão sai em minúsculas, e `.gitignore` não é extensão", () => {
    expect(extensionOf("Foto.PNG")).toBe(".png");
    expect(extensionOf(".gitignore")).toBeNull();
    expect(extensionOf("sem-extensao")).toBeNull();
  });

  it("o nome guardado perde diretório e caractere de controle", () => {
    // O nome vem do cliente e pode carregar caminho inteiro; `\n` quebra qualquer listagem.
    expect(sanitizeFilename("C:\\Users\\chico\\foto.png")).toBe("foto.png");
    expect(sanitizeFilename("nome\ncom\tcontrole.png")).toBe("nomecomcontrole.png");
    expect(sanitizeFilename("   ")).toBe("sem-nome");
  });
});

describe("snippet de figura", () => {
  it("sai com `figure`, `includegraphics` e `label`", () => {
    const snippet = figureSnippet({ assetName: "grafico.png", caption: "O gráfico" });

    expect(snippet).toContain("\\begin{figure}[htbp]");
    expect(snippet).toContain("\\includegraphics{grafico.png}");
    expect(snippet).toContain("\\caption{O gráfico}");
  });

  it("o `label` vem do nome — nunca fica vazio", () => {
    // `\label{fig:}` compila, referencia nada, e o `\ref` vira "??" no PDF sem erro nenhum.
    expect(figureSnippet({ assetName: "Gráfico de Juros.png" })).toContain(
      "\\label{fig:grafico-de-juros}",
    );
    expect(figureSnippet({ assetName: "___.png" })).toContain("\\label{fig:figura}");
  });

  it("largura em fração de `\\textwidth`, quando pedida", () => {
    expect(figureSnippet({ assetName: "a.png", widthFraction: 0.8 })).toContain(
      "[width=0.80\\textwidth]",
    );
    expect(figureSnippet({ assetName: "a.png" })).toContain("\\includegraphics{a.png}");
  });

  it("legenda em branco não vira `\\caption{}`", () => {
    expect(figureSnippet({ assetName: "a.png", caption: "   " })).not.toContain("caption");
  });
});

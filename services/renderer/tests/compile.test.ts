import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { DEFAULT_RENDER_OPTIONS, type RenderBundle } from "@latexbookbank/render-contract";

import { buildDocument, compile } from "../src/compile.ts";

/**
 * A compilação, contra o `pdflatex` de verdade.
 *
 * Não há dublê aqui de propósito. O que este worker faz é chamar dois binários e ler o que eles
 * produzem; um teste com processo falso verificaria que eu sei escrever um processo falso. O TeX
 * Live está na máquina de desenvolvimento e vai estar na imagem — se não estiver, é isto que
 * falha, e falhar aqui é melhor do que descobrir no droplet.
 */

const bundle = (over: Partial<RenderBundle> = {}): RenderBundle => ({
  jobId: "job-teste",
  sourceLatex: "Olá, mundo. $x^2 + y^2 = z^2$",
  profile: {
    id: "minimo",
    documentClass: "article",
    documentClassOptions: ["12pt"],
    preamble: ["\\usepackage[utf8]{inputenc}", "\\usepackage{amsmath}"],
    engine: "pdflatex",
  },
  assets: [],
  options: DEFAULT_RENDER_OPTIONS,
  ...over,
});

const deps = { rendererVersion: "teste-1" };

describe("buildDocument", () => {
  it("monta classe, preâmbulo e corpo na ordem", () => {
    const document = buildDocument(bundle());

    expect(document).toContain("\\documentclass[12pt]{article}");
    expect(document.indexOf("\\usepackage{amsmath}")).toBeLessThan(
      document.indexOf("\\begin{document}"),
    );
    expect(document).toContain("Olá, mundo.");
  });

  it("preserva acento — o documento vai em UTF-8, sem escape", () => {
    // Não é hipótese: o `String.raw` do Bun 1.3 transforma `ã` nos seis caracteres `\u00E3`, e
    // um documento com isso compila em silêncio produzindo `ŏ0E3` na página (`\u` é o acento
    // breve em T1). Se alguém "melhorar" a montagem escapando a saída, é aqui que aparece.
    const doc = buildDocument(bundle({ sourceLatex: "Questão de porcentagem" }));

    expect(doc).toContain("Questão");
    expect(doc).not.toContain("\\u00");
  });

  it("omite os colchetes quando não há opção de classe", () => {
    const doc = buildDocument(
      bundle({
        profile: { ...bundle().profile, documentClassOptions: [] },
      }),
    );
    expect(doc).toContain("\\documentclass{article}");
  });
});

describe("compile", () => {
  it("compila um documento simples e devolve PDF e PNG", async () => {
    const { result, artifacts } = await compile(bundle(), new Map(), deps);

    expect(result.success).toBe(true);
    expect(result.pdf?.mimeType).toBe("application/pdf");
    expect(result.png.length).toBeGreaterThanOrEqual(1);

    // O descritor tem de descrever os bytes que vieram junto, ou a aplicação grava outra coisa.
    const pdfBytes = artifacts.get("main.pdf");
    expect(pdfBytes?.byteLength).toBe(result.pdf?.sizeBytes);
    expect(createHash("sha256").update(pdfBytes!).digest("hex")).toBe(result.pdf?.sha256);
  });

  it("lê largura e altura do PNG sem biblioteca de imagem", async () => {
    const { result } = await compile(bundle(), new Map(), deps);
    const [page] = result.png;

    expect(page?.width).toBeGreaterThan(0);
    expect(page?.height).toBeGreaterThan(0);
  });

  it("o DPI muda o tamanho da imagem", async () => {
    const baixo = await compile(
      bundle({ options: { ...DEFAULT_RENDER_OPTIONS, dpi: 72 } }),
      new Map(),
      deps,
    );
    const alto = await compile(
      bundle({ options: { ...DEFAULT_RENDER_OPTIONS, dpi: 200 } }),
      new Map(),
      deps,
    );

    expect((alto.result.png[0]?.width ?? 0) > (baixo.result.png[0]?.width ?? 0)).toBe(true);
  });

  it("erro de LaTeX vira diagnóstico com linha, não exceção", async () => {
    const { result } = await compile(
      bundle({ sourceLatex: "antes\n\\comandoQueNaoExiste\ndepois" }),
      new Map(),
      deps,
    );

    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.severity === "error")).toBe(true);
    expect(result.diagnostics.some((d) => d.line !== null)).toBe(true);
  });

  it("o log cru vem junto — a tradução sempre perde alguma coisa", async () => {
    const { result } = await compile(bundle(), new Map(), deps);
    expect(result.stdout).toContain("pdfTeX");
  });

  it("recusa `\\write18` antes de tocar o disco", async () => {
    const { result, artifacts } = await compile(
      bundle({ sourceLatex: "\\immediate\\write18{touch /tmp/invadido}" }),
      new Map(),
      deps,
    );

    expect(result.success).toBe(false);
    expect(result.diagnostics[0]?.message).toContain("execução de shell");
    expect(artifacts.size).toBe(0);
  });

  it("grava o asset e o LaTeX o encontra", async () => {
    // Um PNG 1×1 de verdade: o `\includegraphics` precisa de arquivo que o TeX consiga ler.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );

    const { result } = await compile(
      bundle({
        sourceLatex: "\\includegraphics[width=1cm]{ponto.png}",
        profile: {
          ...bundle().profile,
          preamble: [...bundle().profile.preamble, "\\usepackage{graphicx}"],
        },
        assets: [
          {
            name: "ponto.png",
            mimeType: "image/png",
            sizeBytes: png.byteLength,
            sha256: createHash("sha256").update(png).digest("hex"),
          },
        ],
      }),
      new Map([["ponto.png", png]]),
      deps,
    );

    expect(result.success).toBe(true);
  });

  it("recusa asset cujo sha256 não bate com os bytes", async () => {
    // Ou o transporte corrompeu, ou trocaram o arquivo no caminho. As duas hipóteses pedem parar.
    const png = Buffer.from("nao e png");

    await expect(
      compile(
        bundle({
          assets: [
            {
              name: "ponto.png",
              mimeType: "image/png",
              sizeBytes: png.byteLength,
              sha256: "0".repeat(64),
            },
          ],
        }),
        new Map([["ponto.png", png]]),
        deps,
      ),
    ).rejects.toThrow(/sha256 não confere/);
  });

  it("não deixa diretório temporário para trás", async () => {
    const { readdir } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");

    const before = (await readdir(tmpdir())).filter((n) => n.startsWith("lbb-render-")).length;
    await compile(bundle(), new Map(), deps);
    const after = (await readdir(tmpdir())).filter((n) => n.startsWith("lbb-render-")).length;

    // Sem a limpeza, cada compilação deixaria um diretório com o documento e os assets do job.
    expect(after).toBe(before);
  });

  it("mede a duração com o relógio injetado", async () => {
    const ticks = [1_000, 4_500];
    const { result } = await compile(bundle(), new Map(), {
      rendererVersion: "teste-1",
      now: () => ticks.shift() ?? 4_500,
    });

    expect(result.durationMs).toBe(3_500);
  });

  it("carimba a versão do renderer — é ela que invalida o cache da aplicação", async () => {
    const { result } = await compile(bundle(), new Map(), deps);
    expect(result.rendererVersion).toBe("teste-1");
  });
});

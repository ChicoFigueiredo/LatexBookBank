import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { DEFAULT_RENDER_OPTIONS, type RenderBundle } from "@latexbookbank/render-contract";

import { buildDocument, compile } from "../src/compile.ts";
import { describeComTex } from "./tex.ts";

/**
 * A compilação, contra o `pdflatex` de verdade.
 *
 * Não há dublê aqui de propósito. O que este worker faz é chamar dois binários e ler o que eles
 * produzem; um teste com processo falso verificaria que eu sei escrever um processo falso. O TeX
 * Live está na máquina de desenvolvimento e no job `renderer-tex` do CI, que exige o TeX
 * (`RENDERER_REQUIRE_TEX=1`): lá, a falta dele é falha. Onde não há TeX, os blocos que compilam
 * são pulados com o motivo no nome — ver `tests/tex.ts`.
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

/** O que o worker recusa antes de chamar o TeX: roda em qualquer máquina, com ou sem `pdflatex`. */
describe("compile — recusas antes do TeX", () => {
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
});

describeComTex("compile", () => {
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

  it("não deixa diretório temporário para trás", async () => {
    const { mkdtemp, readdir, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    // Uma raiz só deste teste: contar os `lbb-render-*` do `tmpdir()` inteiro quebrava sempre que
    // outra compilação rodava na máquina ao mesmo tempo.
    const root = await mkdtemp(join(tmpdir(), "lbb-compile-test-"));
    try {
      // O diretório do job nasce nesta raiz — sem isso, ela vazia no fim não provaria nada.
      await expect(
        compile(bundle(), new Map(), { ...deps, tmpRoot: join(root, "nao-existe") }),
      ).rejects.toThrow(/ENOENT/);

      const { result } = await compile(bundle(), new Map(), { ...deps, tmpRoot: root });
      expect(result.success).toBe(true);

      // Sem a limpeza, cada compilação deixaria um diretório com o documento e os assets do job.
      expect(await readdir(root)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("mede a duração com o relógio injetado", async () => {
    const ticks = [1_000, 4_500];
    const { result } = await compile(bundle(), new Map(), {
      rendererVersion: "teste-1",
      now: () => ticks.shift() ?? 4_500,
    });

    expect(result.durationMs).toBe(3_500);
  });

  it("de quem é a falha: erro de LaTeX é do documento, PDF que saiu não tem falha", async () => {
    // Só a falha do documento a aplicação pode guardar no cache: o mesmo LaTeX dá o mesmo erro.
    const quebrado = await compile(bundle({ sourceLatex: "\\naoExiste" }), new Map(), deps);
    const certo = await compile(bundle(), new Map(), deps);

    expect(quebrado.result.failureKind).toBe("document");
    expect(certo.result.failureKind).toBeUndefined();
  });

  it("o prazo estourado é falha de tempo, não do documento", async () => {
    // O mesmo LaTeX pode passar quando a máquina não estiver montando o formato ao mesmo tempo;
    // guardado no cache, "passou de N ms" virava a resposta permanente daquele documento.
    const { result } = await compile(
      bundle({
        sourceLatex: "\\loop\\iftrue\\repeat",
        options: { ...DEFAULT_RENDER_OPTIONS, timeoutMs: 1_500 },
      }),
      new Map(),
      deps,
    );

    expect(result.success).toBe(false);
    expect(result.failureKind).toBe("timeout");
  });

  it("carimba a versão do renderer — é ela que invalida o cache da aplicação", async () => {
    const { result } = await compile(bundle(), new Map(), deps);
    expect(result.rendererVersion).toBe("teste-1");
  });
});

/**
 * O documento não lê arquivo fora do job (#244, SEC-02 da revisão de 2026-09-23).
 *
 * `-no-shell-escape` impede executar comando, não ler arquivo: com o `openin_any=a` padrão do TeX
 * Live, `\openin` abre qualquer caminho, e o que ele lê volta no log — que a aplicação grava, mostra
 * e manda ao modelo de IA. Na imagem do worker, `/proc/1/environ` trazia o `RENDERER_SECRET`.
 */
describeComTex("compile — leitura de arquivo", () => {
  const leitura = (caminho: string) =>
    bundle({
      sourceLatex: [
        "\\newread\\arquivo",
        `\\openin\\arquivo=${caminho}`,
        "\\ifeof\\arquivo\\typeout{ARQUIVO-FECHADO}\\else",
        "\\read\\arquivo to\\linha\\typeout{LIDO:\\detokenize\\expandafter{\\linha}}\\fi",
        "Texto.",
      ].join("\n"),
    });

  it("recusa caminho absoluto: /etc/passwd não chega ao log", async () => {
    const { result } = await compile(leitura("/etc/passwd"), new Map(), deps);

    expect(result.stdout).not.toContain("LIDO:");
    expect(result.stdout).toContain("ARQUIVO-FECHADO");
  });

  it("recusa o ambiente do processo: /proc/self/environ não chega ao log", async () => {
    // No contêiner, o `/proc/1/environ` do worker trazia o `RENDERER_SECRET`. Aqui o PID 1 é o
    // init da máquina, que o usuário não lê; o `self` do `pdflatex` é o mesmo caminho absoluto.
    const { result } = await compile(leitura("/proc/self/environ"), new Map(), deps);

    expect(result.stdout).not.toContain("LIDO:");
    expect(result.stdout).toContain("ARQUIVO-FECHADO");
  });

  it("recusa subir de diretório: ../ não sai do job", async () => {
    const { result } = await compile(
      leitura("../../../../../../../../etc/passwd"),
      new Map(),
      deps,
    );

    expect(result.stdout).not.toContain("LIDO:");
    expect(result.stdout).toContain("ARQUIVO-FECHADO");
  });
});

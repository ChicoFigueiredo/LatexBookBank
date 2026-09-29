import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_RENDER_OPTIONS,
  InvalidBundleError,
  MAX_ASSETS,
  isSafeAssetName,
  requestsShellEscape,
  validateRenderBundle,
  type RenderBundle,
} from "@latexbookbank/render-contract";

/**
 * O contrato do render (D35).
 *
 * Metade destes testes é sobre o que o contrato **não** tem. Não é excesso de zelo: o worker roda
 * sem credencial de storage, sem credencial de banco e sem API key, e o que garante isso não é uma
 * promessa no README — é não haver caminho de código até lá. Um `import` a mais num arquivo do
 * contrato reabriria o caminho em silêncio, e a auditoria só descobriria depois do deploy.
 */

const contractDir = fileURLToPath(
  new URL("../../../packages/render-contract/src", import.meta.url),
);

const contractSources = readdirSync(contractDir)
  .filter((name) => name.endsWith(".ts"))
  .map((name) => ({ name, code: readFileSync(`${contractDir}/${name}`, "utf8") }));

/** Sem comentários: uma menção em prosa — como esta — não pode disparar falso positivo. */
const codeOf = (source: string): string =>
  source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith("*") && !trimmed.startsWith("/*") && !trimmed.startsWith("//");
    })
    .join("\n");

const bundle = (over: Partial<RenderBundle> = {}): RenderBundle => ({
  jobId: "job-1",
  sourceLatex: "\\documentclass{article}\\begin{document}oi\\end{document}",
  profile: {
    id: "legacy",
    documentClass: "article",
    documentClassOptions: [],
    preamble: ["\\usepackage{amsmath}"],
    engine: "pdflatex",
  },
  assets: [],
  options: DEFAULT_RENDER_OPTIONS,
  ...over,
});

const asset = (over: Partial<RenderBundle["assets"][number]> = {}) => ({
  name: "figura.png",
  mimeType: "image/png",
  sizeBytes: 1024,
  sha256: "a".repeat(64),
  ...over,
});

describe("o contrato não alcança o domínio", () => {
  it("não importa nada", () => {
    // Zero dependências é o que impede o worker de chegar ao banco por um caminho transitivo.
    for (const { name, code } of contractSources) {
      const imports = [...codeOf(code).matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1] ?? "");
      const external = imports.filter((path) => !path.startsWith("./"));
      expect(external, `${name} importa de fora do pacote`).toEqual([]);
    }
  });

  it("não menciona storage, banco nem nuvem", () => {
    const forbidden = [
      "prisma",
      "PrismaClient",
      "StorageProvider",
      "storageKey",
      "@aws-sdk",
      "S3",
      "vercel",
      "blob",
      "DATABASE_URL",
      "workspaceId",
      "Workspace",
    ];

    for (const { name, code } of contractSources) {
      const body = codeOf(code);
      for (const term of forbidden) {
        expect(body.includes(term), `${name} menciona \`${term}\``).toBe(false);
      }
    }
  });

  it("o `jobId` é a única identidade — nada de id de questão ou publicação", () => {
    // Se o worker soubesse o que está compilando, "o worker não conhece o domínio" viraria frase.
    for (const { name, code } of contractSources) {
      const body = codeOf(code);
      expect(body.includes("questionId"), `${name} menciona questionId`).toBe(false);
      expect(body.includes("publicationId"), `${name} menciona publicationId`).toBe(false);
    }
  });
});

describe("isSafeAssetName", () => {
  it("aceita nome simples de arquivo", () => {
    expect(isSafeAssetName("figura.png")).toBe(true);
    expect(isSafeAssetName("grafico-01_v2.pdf")).toBe(true);
  });

  it("recusa qualquer coisa que saia do diretório do job", () => {
    // Lista do que pode, não do que não pode: as tentativas desconhecidas falham junto.
    for (const name of [
      "../etc/passwd",
      "/etc/passwd",
      "a/b.png",
      "a\\b.png",
      "..",
      ".oculto",
      "figura\u0000.png",
      "",
    ]) {
      expect(isSafeAssetName(name), `aceitou \`${name}\``).toBe(false);
    }
  });
});

describe("validateRenderBundle", () => {
  it("aceita um bundle mínimo", () => {
    expect(() => validateRenderBundle(bundle())).not.toThrow();
  });

  it("recusa fonte vazia — não há o que compilar", () => {
    expect(() => validateRenderBundle(bundle({ sourceLatex: "  " }))).toThrow(InvalidBundleError);
  });

  it("recusa asset com caminho no nome", () => {
    expect(() =>
      validateRenderBundle(bundle({ assets: [asset({ name: "../fora.png" })] })),
    ).toThrow(/nome de arquivo simples/);
  });

  it("recusa nome de asset repetido", () => {
    // O segundo sobrescreveria o primeiro no disco, e a compilação usaria um arquivo que ninguém
    // pediu — em silêncio.
    expect(() =>
      validateRenderBundle(bundle({ assets: [asset(), asset({ sha256: "b".repeat(64) })] })),
    ).toThrow(/repetido/);
  });

  it("recusa sha256 que não é hexadecimal de 64", () => {
    expect(() => validateRenderBundle(bundle({ assets: [asset({ sha256: "abc" })] }))).toThrow(
      /sha256/,
    );
  });

  it("recusa mais assets do que o teto", () => {
    const many = Array.from({ length: MAX_ASSETS + 1 }, (_, i) => asset({ name: `f${i}.png` }));
    expect(() => validateRenderBundle(bundle({ assets: many }))).toThrow(/assets num job/);
  });

  it("recusa dpi e timeout fora da faixa", () => {
    expect(() =>
      validateRenderBundle(bundle({ options: { ...DEFAULT_RENDER_OPTIONS, dpi: 5000 } })),
    ).toThrow(/dpi/);
    expect(() =>
      validateRenderBundle(bundle({ options: { ...DEFAULT_RENDER_OPTIONS, timeoutMs: 999 } })),
    ).toThrow(/timeoutMs/);
  });

  it("recusa engine que não seja pdflatex", () => {
    const wrong = bundle();
    const tampered = {
      ...wrong,
      profile: { ...wrong.profile, engine: "lualatex" as unknown as "pdflatex" },
    };
    expect(() => validateRenderBundle(tampered)).toThrow(/pdflatex/);
  });
});

describe("requestsShellEscape", () => {
  it("reconhece o pedido de execução de shell", () => {
    expect(requestsShellEscape("\\write18{rm -rf /}")).toBe(true);
    expect(requestsShellEscape("\\immediate\\write18{ls}")).toBe(true);
  });

  it("não confunde escrita normal em arquivo", () => {
    expect(requestsShellEscape("\\write\\myfile{texto}")).toBe(false);
    expect(requestsShellEscape("Em 2018 escrevi isso")).toBe(false);
  });

  /*
    As formas que contornavam a checagem (#244, SEC-08 da revisão de 2026-09-23). A defesa de
    verdade continua sendo `-no-shell-escape` mais `openin_any=p` no worker; isto é a segunda camada,
    e uma camada que qualquer `\csname` atravessa não é camada.
  */
  it("reconhece o pedido disfarçado: csname, \\number, ^^5c e a entrada por pipe", () => {
    expect(requestsShellEscape("\\csname write18\\endcsname{ls}")).toBe(true);
    expect(requestsShellEscape("\\expandafter\\write\\number18{ls}")).toBe(true);
    expect(requestsShellEscape("^^5cwrite18{ls}")).toBe(true);
    expect(requestsShellEscape('\\input|"ls /"')).toBe(true);
    expect(requestsShellEscape('\\input{|"ls /"}')).toBe(true);
    expect(requestsShellEscape("\\openin\\arquivo=|ls")).toBe(true);
  });

  it("não confunde a barra vertical da matemática com pipe", () => {
    expect(requestsShellEscape("Seja $|x| < 1$ e \\input{capitulo}")).toBe(false);
    expect(requestsShellEscape("$\\left| f(x) \\right|$")).toBe(false);
    expect(requestsShellEscape("Rewrite 18 as a sum of two primes.")).toBe(false);
  });
});

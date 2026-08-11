import { describe, expect, it } from "vitest";

import type { RenderProfile } from "@latexbookbank/render-contract";

import { bodyWithFormat, formatKey, formatSource } from "../src/format-cache.ts";

const profile = (over: Partial<RenderProfile> = {}): RenderProfile => ({
  id: "p",
  documentClass: "article",
  documentClassOptions: ["12pt"],
  preamble: ["\\usepackage{amsmath}"],
  engine: "pdflatex",
  ...over,
});

describe("formatKey", () => {
  it("é estável para o mesmo preâmbulo", () => {
    expect(formatKey(profile())).toBe(formatKey(profile()));
  });

  it("muda com preâmbulo, classe e opções", () => {
    const base = formatKey(profile());

    expect(formatKey(profile({ preamble: ["\\usepackage{tikz}"] }))).not.toBe(base);
    expect(formatKey(profile({ documentClass: "book" }))).not.toBe(base);
    expect(formatKey(profile({ documentClassOptions: ["10pt"] }))).not.toBe(base);
  });

  it("**não** muda com o `id` do perfil", () => {
    // O formato é função do preâmbulo, não do nome. Dois perfis com o mesmo preâmbulo devem
    // compartilhar o mesmo `.fmt` — senão a otimização paga duas vezes pelo mesmo trabalho.
    expect(formatKey(profile({ id: "outro" }))).toBe(formatKey(profile()));
  });
});

describe("formatSource", () => {
  it("termina em `\\begin{document}` — é onde o formato é gravado", () => {
    // Sem esta linha o `mylatexformat` lê o arquivo inteiro sem gravar nada e sai com sucesso
    // aparente. Foi assim que a primeira tentativa produziu zero bytes.
    expect(formatSource(profile())).toContain("\\begin{document}");
  });

  it("traz classe e preâmbulo, na ordem", () => {
    const source = formatSource(profile());

    expect(source).toContain("\\documentclass[12pt]{article}");
    expect(source.indexOf("\\usepackage{amsmath}")).toBeLessThan(
      source.indexOf("\\begin{document}"),
    );
  });
});

describe("bodyWithFormat", () => {
  it("não repete classe nem preâmbulo — eles já estão no `.fmt`", () => {
    const body = bodyWithFormat("Olá $x$");

    expect(body).not.toContain("\\documentclass");
    expect(body).not.toContain("\\usepackage");
    expect(body).toContain("Olá $x$");
  });
});

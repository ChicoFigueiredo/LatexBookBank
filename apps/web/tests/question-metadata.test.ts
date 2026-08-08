import { describe, expect, it } from "vitest";

import {
  MetadataError,
  metadataWarnings,
  MIN_YEAR,
  maxYear,
  normalizeMetadata,
  normalizeText,
  normalizeVideoUrl,
  type QuestionMetadata,
} from "@modules/questions/domain/question-metadata";

const now = new Date("2026-08-08T00:00:00Z");

describe("normalizeText", () => {
  it("colapsa espaço e transforma vazio em `null`", () => {
    expect(normalizeText("  CESPE   / CEBRASPE ")).toBe("CESPE / CEBRASPE");
    expect(normalizeText("   ")).toBeNull();
    expect(normalizeText(undefined)).toBeNull();
  });
});

describe("normalizeVideoUrl", () => {
  it("aceita http e https", () => {
    expect(normalizeVideoUrl("https://youtu.be/abc")).toBe("https://youtu.be/abc");
  });

  it("**recusa `javascript:`**", () => {
    // O campo aceita colagem de qualquer lugar, e a interface transforma em link: isto seria XSS
    // armazenado. A checagem fica no domínio porque a regra é do dado, não da tela.
    expect(() => normalizeVideoUrl("javascript:alert(1)")).toThrow(MetadataError);
  });

  it("recusa outros esquemas também", () => {
    expect(() => normalizeVideoUrl("data:text/html,<script>")).toThrow(/http/);
    expect(() => normalizeVideoUrl("file:///etc/passwd")).toThrow(/http/);
  });

  it("recusa o que não é URL", () => {
    expect(() => normalizeVideoUrl("veja no youtube")).toThrow(/não é uma URL/);
  });

  it("vazio é `null`, não erro", () => {
    expect(normalizeVideoUrl("  ")).toBeNull();
  });
});

describe("normalizeMetadata", () => {
  it("aceita a escala legada, e **só** ela", () => {
    // 0 · 2 · 5 · 7 · 10, não 1–5. Mapear para 1–5 perderia a granularidade que o acervo já usa
    // e tornaria o import não reversível.
    for (const difficulty of [0, 2, 5, 7, 10]) {
      expect(normalizeMetadata({ difficulty }, now)).toEqual({ difficulty });
    }
    expect(() => normalizeMetadata({ difficulty: 3 }, now)).toThrow(MetadataError);
    expect(() => normalizeMetadata({ difficulty: 1 }, now)).toThrow(/escala do acervo/);
  });

  it("aceita ano histórico — o acervo tem provas transcritas", () => {
    expect(normalizeMetadata({ year: MIN_YEAR }, now)).toEqual({ year: MIN_YEAR });
  });

  it("aceita o ano seguinte — prova de janeiro é cadastrada em novembro", () => {
    expect(normalizeMetadata({ year: maxYear(now) }, now)).toEqual({ year: maxYear(now) });
  });

  it("**recusa** ano com erro de digitação em vez de adivinhar", () => {
    // Gravar `2024` a partir de `20244` seria adivinhação, e adivinhação em dado de origem é como
    // um acervo perde a confiabilidade.
    expect(() => normalizeMetadata({ year: 20244 }, now)).toThrow(MetadataError);
    expect(() => normalizeMetadata({ year: 1800 }, now)).toThrow(/entre/);
  });

  it("`null` limpa o ano", () => {
    expect(normalizeMetadata({ year: null }, now)).toEqual({ year: null });
  });

  it("campo ausente não entra no resultado", () => {
    // É a diferença entre "não mexa" e "apague": um patch parcial não pode zerar o que não citou.
    expect(normalizeMetadata({ board: "FGV" }, now)).toEqual({ board: "FGV" });
  });

  it("normaliza os textos livres", () => {
    expect(
      normalizeMetadata({ board: "  CESPE ", institution: "", role: "Analista  Judiciário" }, now),
    ).toEqual({ board: "CESPE", institution: null, role: "Analista Judiciário" });
  });
});

describe("metadataWarnings", () => {
  const metadata = (over: Partial<QuestionMetadata> = {}): QuestionMetadata => ({
    difficulty: 5,
    year: null,
    board: null,
    institution: null,
    role: null,
    roleLevel: null,
    publisher: null,
    videoUrl: null,
    ...over,
  });

  it("avisa quando há ano sem banca", () => {
    // O par é o que permite filtrar por prova.
    expect(metadataWarnings(metadata({ year: 2024 }))).toHaveLength(1);
  });

  it("não avisa quando o par está completo", () => {
    expect(metadataWarnings(metadata({ year: 2024, board: "FGV" }))).toEqual([]);
  });

  it("questão sem metadado nenhum não gera aviso", () => {
    // Uma questão de livro não tem banca nem ano, e avisar sobre isso seria ruído em metade do
    // acervo.
    expect(metadataWarnings(metadata())).toEqual([]);
  });
});

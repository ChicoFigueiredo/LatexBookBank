import { describe, expect, it } from "vitest";

import {
  formatImportReport,
  importLatexKnowledge,
  reportBalances,
} from "@modules/latex-knowledge/application/import-latex-knowledge";
import { dedupeKnowledge } from "@modules/latex-knowledge/domain/dedupe-knowledge";
import type {
  LatexKnowledge,
  LatexKnowledgeCounts,
  LatexKnowledgeRepository,
  LatexSnippet,
  LatexSymbol,
  LegacyLatexMetadataReader,
  LegacyReadResult,
  SkippedRows,
} from "@modules/latex-knowledge/domain/latex-knowledge";

const snippet = (over: Partial<LatexSnippet> = {}): LatexSnippet => ({
  trigger: "alpha",
  label: "\\alpha",
  body: "\\\\alpha",
  documentation: null,
  priority: 0,
  hasPlaceholders: false,
  legacyId: 1,
  ...over,
});

const symbol = (over: Partial<LatexSymbol> = {}): LatexSymbol => ({
  groupName: "math",
  command: "\\neq",
  unicode: null,
  requiredPackage: null,
  mathMode: true,
  previewSvg: null,
  sortOrder: 0,
  legacyId: 1,
  ...over,
});

const knowledge = (over: Partial<LatexKnowledge> = {}): LatexKnowledge => ({
  snippets: [],
  symbolGroups: [{ name: "math", sortOrder: 0, legacyId: 4 }],
  symbols: [],
  iconMenus: [],
  ...over,
});

const NOTHING_SKIPPED: SkippedRows = { snippets: 0, symbols: 0, iconMenus: 0 };

class FakeReader implements LegacyLatexMetadataReader {
  constructor(
    private readonly payload: LatexKnowledge,
    private readonly skipped: SkippedRows = NOTHING_SKIPPED,
  ) {}

  async read(): Promise<LegacyReadResult> {
    return {
      knowledge: this.payload,
      // A origem é o que o legado tinha: o que sobrou mais o que o leitor descartou.
      sourceCounts: {
        snippets: this.payload.snippets.length + this.skipped.snippets,
        symbolGroups: this.payload.symbolGroups.length,
        symbols: this.payload.symbols.length + this.skipped.symbols,
        iconMenus: this.payload.iconMenus.length + this.skipped.iconMenus,
      },
      skipped: this.skipped,
    };
  }
}

/** Grava o que recebeu e conta — é tudo o que o caso de uso precisa do repositório. */
class FakeRepository implements LatexKnowledgeRepository {
  written: LatexKnowledge | null = null;
  calls = 0;

  async replaceAll(payload: LatexKnowledge): Promise<LatexKnowledgeCounts> {
    this.calls += 1;
    this.written = payload;
    return {
      snippets: payload.snippets.length,
      symbolGroups: payload.symbolGroups.length,
      symbols: payload.symbols.length,
      iconMenus: payload.iconMenus.length,
    };
  }
}

describe("dedupeKnowledge", () => {
  it("fica com a linha que tem descrição — o legado guarda a mesma duas vezes", () => {
    const { knowledge: result, report } = dedupeKnowledge(
      knowledge({
        snippets: [
          snippet({ legacyId: 4, documentation: null }),
          snippet({ legacyId: 7, documentation: "adds text directly to the file" }),
        ],
      }),
    );

    expect(report.duplicateSnippets).toBe(1);
    expect(result.snippets).toHaveLength(1);
    expect(result.snippets[0]?.legacyId).toBe(7);
  });

  it("no empate mantém a primeira, para o resultado não depender da ordem do SELECT", () => {
    const { knowledge: result } = dedupeKnowledge(
      knowledge({ snippets: [snippet({ legacyId: 4 }), snippet({ legacyId: 7 })] }),
    );
    expect(result.snippets[0]?.legacyId).toBe(4);
  });

  it("deduplica símbolo por grupo + comando — `\\neq` aparece duas vezes em `math`", () => {
    const { knowledge: result, report } = dedupeKnowledge(
      knowledge({
        symbols: [
          symbol({ legacyId: 100, unicode: null }),
          symbol({ legacyId: 101, unicode: "≠" }),
        ],
      }),
    );

    expect(report.duplicateSymbols).toBe(1);
    expect(result.symbols[0]?.unicode).toBe("≠");
  });

  it("o mesmo comando em grupos diferentes não é duplicata", () => {
    const { report } = dedupeKnowledge(
      knowledge({
        symbols: [symbol({ groupName: "math" }), symbol({ groupName: "relation", legacyId: 2 })],
      }),
    );
    expect(report.duplicateSymbols).toBe(0);
  });
});

describe("importLatexKnowledge", () => {
  it("separa lido de gravado — a diferença são as duplicatas", async () => {
    const repository = new FakeRepository();
    const report = await importLatexKnowledge(
      new FakeReader(
        knowledge({
          snippets: [snippet({ legacyId: 1 }), snippet({ legacyId: 2 })],
          symbols: [symbol()],
        }),
      ),
      repository,
      { now: () => 0 },
    );

    expect(report.source.snippets).toBe(2);
    expect(report.written.snippets).toBe(1);
    expect(report.duplicateSnippets).toBe(1);
    expect(reportBalances(report)).toBe(true);
  });

  it("conta os símbolos que não têm como aparecer na palette", async () => {
    const report = await importLatexKnowledge(
      new FakeReader(
        knowledge({
          symbols: [
            symbol({ legacyId: 1, command: "\\a", unicode: "α" }),
            symbol({ legacyId: 2, command: "\\b", previewSvg: "<svg/>" }),
            symbol({ legacyId: 3, command: "\\c" }),
          ],
        }),
      ),
      new FakeRepository(),
      { now: () => 0 },
    );

    expect(report.symbolsWithoutPreview).toBe(1);
  });

  it("é idempotente: duas execuções escrevem exatamente o mesmo conjunto", async () => {
    const payload = knowledge({
      snippets: [snippet({ legacyId: 1 })],
      symbols: [symbol({ legacyId: 1 })],
    });

    const first = new FakeRepository();
    const second = new FakeRepository();
    await importLatexKnowledge(new FakeReader(payload), first, { now: () => 0 });
    await importLatexKnowledge(new FakeReader(payload), second, { now: () => 0 });

    expect(second.written).toEqual(first.written);
    expect(second.calls).toBe(1);
  });

  it("mede a duração com o relógio injetado", async () => {
    const ticks = [1_000, 1_250];
    const report = await importLatexKnowledge(new FakeReader(knowledge()), new FakeRepository(), {
      now: () => ticks.shift() ?? 0,
    });
    expect(report.durationMs).toBe(250);
  });
});

describe("formatImportReport", () => {
  it("mostra as duplicatas em vez de esconder a diferença", async () => {
    const report = await importLatexKnowledge(
      new FakeReader(knowledge({ snippets: [snippet({ legacyId: 1 }), snippet({ legacyId: 2 })] })),
      new FakeRepository(),
      { now: () => 0 },
    );

    const text = formatImportReport(report);
    expect(text).toContain("1 de");
    expect(text).toContain("duplicata");
  });

  it("mostra a linha descartada — é ela que explica 28 menus onde o levantamento diz 29", async () => {
    const report = await importLatexKnowledge(
      new FakeReader(knowledge(), { snippets: 0, symbols: 0, iconMenus: 1 }),
      new FakeRepository(),
      { now: () => 0 },
    );

    expect(report.source.iconMenus).toBe(1);
    expect(report.written.iconMenus).toBe(0);
    expect(formatImportReport(report)).toContain("sem dado utilizável");
    expect(reportBalances(report)).toBe(true);
  });
});

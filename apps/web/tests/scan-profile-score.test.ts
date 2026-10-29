import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import { buildLines, type PageModel } from "@modules/scan/domain/page";
import { rankProfiles, registeredCaptureProfiles } from "@modules/scan/domain/profiles";
import { PdfjsDocumentReader } from "@modules/scan/infrastructure/pdfjs-document-reader";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * Cada perfil pontua uma amostra ([ADR 0007](../../../docs/adr/0007-o-perfil-de-captura-e-codigo.md)).
 *
 * É o gancho que entrou quando sete campos mortos saíram, e ele paga duas contas: a sugestão antes
 * da varredura e o aviso depois dela. O que se afirma aqui é o mínimo de que as duas dependem —
 * que um caderno de prova não se pareça com um livro-texto, e vice-versa.
 */

async function amostra(fixture: string, limite = 8): Promise<readonly PageModel[]> {
  const pdf = await new PdfjsDocumentReader().open(new Uint8Array(await readFile(`tests/fixtures/scan/${fixture}`)));
  const pages: PageModel[] = [];
  try {
    for (let page = 1; page <= Math.min(limite, pdf.pageCount); page++) pages.push(buildLines(await pdf.readPage(page)));
  } finally {
    await pdf.close();
  }
  return pages;
}

describe("o perfil se reconhece numa amostra", () => {
  it("o caderno do ENEM é do exam-enem-v1, e não do livro-texto", async () => {
    const ranking = rankProfiles(await amostra("enem-sintetico.pdf"));

    expect(ranking[0]?.id).toBe("exam-enem-v1");
    // A evidência é metade do valor: ela é o que deixa conferir o palpite sem abrir o PDF.
    expect(ranking[0]?.evidence).toMatch(/QUEST/);
    const livro = ranking.find((entry) => entry.id === "book-v1")!;
    expect(ranking[0]!.score).toBeGreaterThan(livro.score);
  });

  it("o livro-texto é do book-v1, e não do caderno de prova", async () => {
    const ranking = rankProfiles(await amostra("livro-sintetico.pdf"));

    expect(ranking[0]?.id).toBe("book-v1");
    const enem = ranking.find((entry) => entry.id === "exam-enem-v1")!;
    expect(enem.score).toBeLessThan(ranking[0]!.score);
  });

  it("todo perfil registrado sabe se pontuar, e a nota fica entre 0 e 1", async () => {
    const pages = await amostra("book-a.pdf");
    // Obrigatório no contrato justamente para não voltar a existir gancho sem dono.
    for (const profile of registeredCaptureProfiles()) {
      const { score, evidence } = profile.score(pages);
      expect(score, profile.id).toBeGreaterThanOrEqual(0);
      expect(score, profile.id).toBeLessThanOrEqual(1);
      expect(evidence.length, profile.id).toBeGreaterThan(0);
    }
  });

  it("amostra vazia não quebra e não afirma nada", () => {
    for (const entry of rankProfiles([])) expect(entry.score).toBe(0);
  });
});

import { describe, expect, it } from "vitest";

import { createLibrary, renameLibrary } from "@modules/workspaces/application/manage-libraries";
import {
  DuplicateLibraryError,
  InvalidLibraryNameError,
  LibraryNotFoundError,
  normalizeLibraryName,
  slugifyLibrary,
  uniqueSlug,
} from "@modules/workspaces/domain/library";
import type {
  LibraryRepository,
  LibrarySummary,
} from "@modules/workspaces/domain/library-repository";

/**
 * Slice 1 — criar biblioteca é a **primeira ação real** do Beta Editorial.
 *
 * Antes disto, uma biblioteca só nascia por seed ou por import legado. O que estes testes fixam
 * não é a mecânica do CRUD: é que o nome vira slug estável, que duplicata é recusada e que
 * renomear **não** quebra as URLs já guardadas.
 */

class FakeLibraries implements LibraryRepository {
  private rows: LibrarySummary[] = [];
  private seq = 0;

  constructor(seed: readonly { name: string; slug: string }[] = []) {
    for (const entry of seed) this.push(entry.name, entry.slug);
  }

  private push(name: string, slug: string): LibrarySummary {
    const row: LibrarySummary = {
      id: `lib-${++this.seq}`,
      name,
      slug,
      publicationCount: 0,
      updatedAt: new Date(0),
    };
    this.rows.push(row);
    return row;
  }

  list = async (): Promise<readonly LibrarySummary[]> => this.rows;
  findById = async (id: string) => this.rows.find((row) => row.id === id) ?? null;
  findBySlug = async (slug: string) => this.rows.find((row) => row.slug === slug) ?? null;
  listSlugs = async (): Promise<readonly string[]> => this.rows.map((row) => row.slug);

  existsByName = async (name: string) =>
    this.rows.some((row) => slugifyLibrary(row.name) === slugifyLibrary(name));

  create = async (input: { name: string; slug: string }) => this.push(input.name, input.slug);

  rename = async (id: string, name: string) => {
    const row = this.rows.find((entry) => entry.id === id);
    if (!row) return null;

    const renamed = { ...row, name };
    this.rows = this.rows.map((entry) => (entry.id === id ? renamed : entry));
    return renamed;
  };
}

describe("o nome da biblioteca", () => {
  it("normaliza espaço em excesso e recusa o vazio", () => {
    expect(normalizeLibraryName("  Matemática   do   Ensino Médio ")).toBe(
      "Matemática do Ensino Médio",
    );
    expect(() => normalizeLibraryName("   ")).toThrow(InvalidLibraryNameError);
    expect(() => normalizeLibraryName(42)).toThrow(InvalidLibraryNameError);
  });

  it("recusa nome que só tem pontuação — o slug ficaria vazio", () => {
    // Sem esta guarda, `"···"` viraria uma biblioteca com slug `""` e uma URL que não abre.
    expect(() => normalizeLibraryName("···")).toThrow(InvalidLibraryNameError);
  });

  it("preserva o acento ao derivar o slug", () => {
    // `matemtica` é o que sai de remover o caractere acentuado inteiro em vez de decompô-lo. É
    // erro que só aparece na URL do usuário, meses depois.
    expect(slugifyLibrary("Matemática")).toBe("matematica");
    expect(slugifyLibrary("Física & Química")).toBe("fisica-quimica");
    expect(slugifyLibrary("Ações")).toBe("acoes");
  });

  it("desempata o slug com sufixo numérico legível", () => {
    expect(uniqueSlug("acervo", [])).toBe("acervo");
    expect(uniqueSlug("acervo", ["acervo"])).toBe("acervo-2");
    expect(uniqueSlug("acervo", ["acervo", "acervo-2"])).toBe("acervo-3");
  });
});

describe("criar biblioteca", () => {
  it("cria com slug derivado do nome", async () => {
    const repository = new FakeLibraries();
    const library = await createLibrary(repository, { name: "Matemática do Ensino Médio" });

    expect(library.name).toBe("Matemática do Ensino Médio");
    expect(library.slug).toBe("matematica-do-ensino-medio");
  });

  it("recusa nome duplicado, ignorando caixa e acento", async () => {
    const repository = new FakeLibraries([{ name: "Concursos", slug: "concursos" }]);

    await expect(createLibrary(repository, { name: "CONCURSOS" })).rejects.toThrow(
      DuplicateLibraryError,
    );
  });
});

describe("renomear biblioteca", () => {
  it("troca o nome e **preserva** o slug", async () => {
    // O slug já está em URL guardada, em `.lbb` exportado e na chave de storage dos assets.
    // Recalculá-lo a cada renome quebraria links por uma correção de digitação.
    const repository = new FakeLibraries();
    const created = await createLibrary(repository, { name: "Acervo" });

    const renamed = await renameLibrary(repository, created.id, "Acervo de Matemática");

    expect(renamed.name).toBe("Acervo de Matemática");
    expect(renamed.slug).toBe(created.slug);
  });

  it("aceita renomear para o mesmo nome — não é duplicata", async () => {
    const repository = new FakeLibraries();
    const created = await createLibrary(repository, { name: "Acervo" });

    await expect(renameLibrary(repository, created.id, "Acervo")).resolves.toMatchObject({
      name: "Acervo",
    });
  });

  it("recusa colidir com outra biblioteca", async () => {
    const repository = new FakeLibraries();
    const first = await createLibrary(repository, { name: "Acervo" });
    await createLibrary(repository, { name: "Concursos" });

    await expect(renameLibrary(repository, first.id, "Concursos")).rejects.toThrow(
      DuplicateLibraryError,
    );
  });

  it("recusa id inexistente", async () => {
    await expect(renameLibrary(new FakeLibraries(), "nao-existe", "X")).rejects.toThrow(
      LibraryNotFoundError,
    );
  });
});

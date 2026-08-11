import { describe, expect, it } from "vitest";

import {
  CatalogEntryNotFoundError,
  DuplicatePublicationError,
  importFromCatalog,
  type CatalogAssetWriter,
  type PublicationOriginWriter,
} from "@modules/publications/application/import-from-catalog";
import {
  duplicateSignalFor,
  draftFromCatalog,
  type ExistingPublication,
} from "@modules/publications/domain/catalog-import";
import type {
  PublicationDetail,
  PublicationRepository,
  PublicationSummary,
  PublicationWrite,
} from "@modules/publications/domain/publication-repository";
import type {
  LibraryRepository,
  LibrarySummary,
} from "@modules/workspaces/domain/library-repository";
import type {
  CatalogBook,
  CatalogEntry,
  LibraryCatalogProvider,
} from "@/shared/ports/library-catalog";

/**
 * Slice 10 — Calibre vira livro do LatexBookBank.
 *
 * O que estes testes fixam não é a leitura do catálogo (isso é `calibre-catalog.test.ts`): é o que
 * a importação **faz com o que leu**. Três coisas, e todas foram decisão:
 *
 * - a publicação nasce pelo mesmo caso de uso do cadastro manual;
 * - o PDF e a capa são **copiados**, e a origem fica registrada;
 * - duplicata exata bloqueia, semelhança avisa.
 */

const entrada = (over: Partial<CatalogEntry> = {}): CatalogEntry => ({
  externalId: "uuid-1",
  title: "Conjuntos e Funções",
  authors: ["Iezzi, Gelson", "Murakami, Carlos"],
  publisher: "Atual",
  year: 2013,
  isbn: "9783161484100",
  language: "por",
  series: "Fundamentos de Matemática Elementar",
  seriesIndex: "1",
  files: [{ format: "PDF", filename: "livro.pdf", sizeBytes: 1024 }],
  hasCover: true,
  ...over,
});

class FakeCatalog implements LibraryCatalogProvider {
  readonly id = "calibre";
  constructor(private readonly entries: readonly CatalogEntry[]) {}

  describe = async () => ({ bookCount: this.entries.length, formats: { PDF: 1 } });
  list = async (): Promise<readonly CatalogEntry[]> => this.entries;

  read = async (externalId: string, formats?: readonly string[]): Promise<CatalogBook | null> => {
    const entry = this.entries.find((item) => item.externalId === externalId);
    if (!entry) return null;

    const files = entry.files
      .filter((file) => formats === undefined || formats.includes(file.format))
      .map((file) => ({ file, content: new TextEncoder().encode(`bytes de ${file.filename}`) }));

    return {
      entry,
      files,
      cover: entry.hasCover
        ? { filename: "cover.jpg", content: new TextEncoder().encode("capa") }
        : null,
    };
  };
}

const LIBRARY: LibrarySummary = {
  id: "lib-1",
  name: "Acervo",
  slug: "acervo",
  publicationCount: 0,
  updatedAt: new Date(0),
};

const libraries: LibraryRepository = {
  list: async () => [LIBRARY],
  findById: async (id) => (id === LIBRARY.id ? LIBRARY : null),
  findBySlug: async () => LIBRARY,
  listSlugs: async () => [LIBRARY.slug],
  existsByName: async () => false,
  create: async () => LIBRARY,
  rename: async () => LIBRARY,
};

class FakePublications implements PublicationRepository {
  written: PublicationWrite[] = [];

  listByWorkspaceSlug = async (): Promise<readonly PublicationSummary[]> => [];
  listByWorkspaceId = async (): Promise<readonly PublicationSummary[]> => [];
  findById = async () => null;
  findDetailById = async () => null;
  update = async () => null;

  create = async (workspaceId: string, write: PublicationWrite): Promise<PublicationDetail> => {
    this.written.push(write);
    return {
      id: `pub-${this.written.length}`,
      workspaceId,
      title: write.title,
      nickname: write.nickname,
      publisher: write.publisher,
      nodeCount: 0,
      subtitle: write.subtitle,
      authors: write.authors,
      edition: write.edition,
      editionYear: write.editionYear,
      isbn: write.isbn,
      language: write.language,
      series: write.series,
      volume: write.volume,
      notes: write.notes,
      coverAssetId: null,
      sourcePdfAssetId: null,
      questionCount: 0,
      updatedAt: new Date(0),
    };
  };
}

class FakeAssets implements CatalogAssetWriter {
  stored: Parameters<CatalogAssetWriter["store"]>[0][] = [];
  store = async (input: Parameters<CatalogAssetWriter["store"]>[0]) => {
    this.stored.push(input);
    return { id: `asset-${this.stored.length}` };
  };
}

class FakeOrigin implements PublicationOriginWriter {
  received: Parameters<PublicationOriginWriter["attachOrigin"]>[1] | null = null;
  attachOrigin = async (
    _publicationId: string,
    input: Parameters<PublicationOriginWriter["attachOrigin"]>[1],
  ) => {
    this.received = input;
  };
}

const NOW = new Date("2026-08-11T12:00:00.000Z");

const importar = async (
  entries: readonly CatalogEntry[],
  existing: readonly ExistingPublication[] = [],
  over: Partial<Parameters<typeof importFromCatalog>[1]> = {},
) => {
  const publications = new FakePublications();
  const assets = new FakeAssets();
  const origin = new FakeOrigin();

  const result = await importFromCatalog(
    {
      catalog: new FakeCatalog(entries),
      libraries,
      publications,
      assets,
      origin,
      existing: async () => existing,
    },
    {
      libraryId: "lib-1",
      externalId: entries[0]?.externalId ?? "uuid-1",
      maxYear: 2027,
      now: NOW,
      ...over,
    },
  );

  return { result, publications, assets, origin };
};

describe("do catálogo para o formulário", () => {
  it("traduz o livro para o mesmo rascunho do cadastro manual", () => {
    // O Calibre deixa de existir aqui. Um caminho de escrita separado para livro importado seria
    // a segunda porta que diverge da primeira na primeira mudança.
    expect(draftFromCatalog(entrada())).toEqual({
      title: "Conjuntos e Funções",
      authors: ["Iezzi, Gelson", "Murakami, Carlos"],
      publisher: "Atual",
      editionYear: 2013,
      isbn: "9783161484100",
      language: "por",
      series: "Fundamentos de Matemática Elementar",
      volume: "1",
    });
  });

  it("**não** inventa volume em livro sem coleção", () => {
    // O Calibre grava `series_index = 1.0` em todo livro, com ou sem série. Importado
    // literalmente, todo livro avulso do acervo viraria "volume 1". Visto contra o acervo real.
    expect(draftFromCatalog(entrada({ series: null })).volume).toBeNull();
  });
});

describe("duplicata", () => {
  const existente: ExistingPublication = {
    id: "pub-x",
    title: "Conjuntos e Funções",
    isbn: "9783161484100",
    authors: ["Iezzi, Gelson"],
    externalId: "uuid-1",
  };

  it("reconhece pelo id do catálogo, pelo ISBN e por título+autor — nesta ordem", () => {
    expect(duplicateSignalFor(entrada(), [existente]).signal).toBe("external-id");

    expect(
      duplicateSignalFor(entrada({ externalId: "outro" }), [existente]).signal,
    ).toBe("isbn");

    expect(
      duplicateSignalFor(entrada({ externalId: "outro", isbn: null }), [existente]).signal,
    ).toBe("title-and-author");
  });

  it("ignora acento e caixa no título", () => {
    const semAcento = entrada({ externalId: "outro", isbn: null, title: "CONJUNTOS E FUNCOES" });
    expect(duplicateSignalFor(semAcento, [existente]).signal).toBe("title-and-author");
  });

  it("bloqueia o exato e **avisa** o parecido", async () => {
    await expect(importar([entrada()], [existente])).rejects.toThrow(DuplicatePublicationError);

    // Dois volumes de uma coleção têm títulos parecidos de propósito: recusar por semelhança
    // esconderia do usuário um livro que ele quer importar.
    const { result } = await importar([entrada({ externalId: "outro", isbn: null })], [existente]);
    expect(result.warnings.join(" ")).toContain("título e autor parecidos");
  });

  it("importa assim mesmo quando o usuário insiste", async () => {
    const { result } = await importar([entrada()], [existente], { force: true });
    expect(result.warnings.join(" ")).toContain("a seu pedido");
  });
});

describe("importar do catálogo", () => {
  it("copia o PDF e a capa para o storage gerenciado", async () => {
    // §29: acervo que aponta para arquivo externo quebra no dia em que a pasta do Calibre muda de
    // lugar. O que entra é cópia.
    const { assets } = await importar([entrada()]);

    expect(assets.stored.map((item) => item.kind)).toEqual(["SOURCE_PDF", "COVER"]);
    expect(new TextDecoder().decode(assets.stored[0]?.content)).toBe("bytes de livro.pdf");
  });

  it("registra a origem, com o id que faz a reimportação reconhecer", async () => {
    const { origin } = await importar([entrada()]);

    expect(JSON.parse(origin.received?.metadataJson ?? "{}")).toEqual({
      provider: "calibre",
      externalId: "uuid-1",
      importedAt: NOW.toISOString(),
      availableFormats: ["PDF"],
    });
    expect(origin.received?.sourcePdfAssetId).toBe("asset-1");
    expect(origin.received?.coverAssetId).toBe("asset-2");
  });

  it("avisa quando não há PDF — a captura por recorte não vai funcionar", async () => {
    const semPdf = entrada({ files: [{ format: "EPUB", filename: "l.epub", sizeBytes: 1 }] });
    const { result, origin } = await importar([semPdf]);

    expect(result.warnings.join(" ")).toContain("não tem PDF");
    expect(origin.received?.sourcePdfAssetId).toBeNull();
  });

  it("**o ISBN torto não impede o livro de entrar**", async () => {
    // O ISBN é campo livre no Calibre e vem errado com frequência. Recusar o livro inteiro por
    // causa dele seria deixar de fora um livro que o usuário quer, por um dado corrigível depois.
    const { result, publications } = await importar([entrada({ isbn: "9783161484101" })]);

    expect(result.warnings.join(" ")).toContain("ISBN do catálogo recusado");
    expect(publications.written.at(-1)?.isbn).toBeNull();
    expect(publications.written.at(-1)?.title).toBe("Conjuntos e Funções");
  });

  it("devolve rota navegável — o livro precisa abrir depois de importar", async () => {
    const { result } = await importar([entrada()]);
    expect(result.href).toBe("/publications/pub-1");
  });

  it("a publicação devolvida já traz capa e fonte ligadas", async () => {
    // `createPublication` responde antes do `attachOrigin`. Devolver aquela resposta faria a API
    // dizer "sem capa" sobre um livro que acabou de receber uma.
    const { result } = await importar([entrada()]);

    expect(result.publication.sourcePdfAssetId).toBe("asset-1");
    expect(result.publication.coverAssetId).toBe("asset-2");
  });

  it("recusa livro que sumiu do catálogo entre a lista e o clique", async () => {
    await expect(importar([entrada()], [], { externalId: "sumiu" })).rejects.toThrow(
      CatalogEntryNotFoundError,
    );
  });
});

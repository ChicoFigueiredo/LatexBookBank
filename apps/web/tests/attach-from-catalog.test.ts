import { describe, expect, it } from "vitest";

import {
  attachFromCatalog,
  CatalogPdfMissingError,
  PublicationHasSourceError,
  type AttachSourceInput,
  type AttachSourceResult,
  type PublicationSourceWriter,
} from "@modules/publications/application/attach-from-catalog";
import type { CatalogAssetWriter } from "@modules/publications/application/catalog-source";
import { CatalogEntryNotFoundError } from "@modules/publications/application/import-from-catalog";
import { PublicationNotFoundError } from "@modules/publications/application/manage-publications";
import { camposAPreencher } from "@modules/publications/domain/catalog-attach";
import type {
  PublicationDetail,
  PublicationRepository,
  PublicationSummary,
  PublicationWrite,
} from "@modules/publications/domain/publication-repository";
import type {
  CatalogBook,
  CatalogEntry,
  LibraryCatalogProvider,
} from "@/shared/ports/library-catalog";

/**
 * **Anexar** — o irmão do import pelo lado de quem já tem o livro (D44).
 *
 * O que estes testes fixam é o que a D44 decidiu e o que o app fazia de errado antes dela:
 *
 * - um livro que já existe **ganha** a fonte, sem virar um livro novo;
 * - fonte que já está lá não é trocada em silêncio — e trocada, a anterior **não some**;
 * - EPUB não vira PDF fonte só porque era o que havia;
 * - metadado do catálogo entra em campo vazio e **em nenhum outro**;
 * - `metadataJson` não recebe `CatalogOrigin`: o Calibre é origem, não dono.
 *
 * O dublê de `PublicationSourceWriter` carrega **a condição** — a escrita só vale se a fonte ainda
 * for a que se leu —, pelo mesmo motivo que o dublê de `AssetWriter` em `register-uploaded-asset`:
 * um fake que aceita sempre passa em "não sobrescreve" e mente na corrida.
 */

const entrada = (over: Partial<CatalogEntry> = {}): CatalogEntry => ({
  externalId: "uuid-elon-1",
  title: "Curso de Análise Vol. 1",
  authors: ["Lima, Elon Lages"],
  publisher: "IMPA",
  year: 2011,
  isbn: null,
  language: "por",
  series: "Projeto Euclides",
  seriesIndex: "1",
  files: [{ format: "PDF", filename: "curso-de-analise.pdf", sizeBytes: 2_818_093 }],
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

    return {
      entry,
      files: entry.files
        .filter((file) => formats === undefined || formats.includes(file.format))
        .map((file) => ({ file, content: new TextEncoder().encode(`bytes de ${file.filename}`) })),
      cover: entry.hasCover
        ? { filename: "cover.jpg", content: new TextEncoder().encode("capa") }
        : null,
    };
  };
}

const LIVRO: PublicationDetail = {
  id: "pub-1",
  workspaceId: "ws-1",
  title: "Curso de Analise Vol. 1",
  nickname: null,
  publisher: null,
  nodeCount: 2,
  subtitle: null,
  authors: ["Lima, Elon Lages"],
  edition: null,
  editionYear: null,
  isbn: null,
  language: null,
  series: null,
  volume: null,
  notes: null,
  coverAssetId: "cover-antiga",
  sourcePdfAssetId: null,
  questionCount: 0,
  updatedAt: new Date(0),
};

class FakePublications implements PublicationRepository {
  // Anexar não cria e não exclui livro nenhum. Os dublês recusam em vez de devolver `noop`, para
  // que um caminho que passe a chamá-los apareça no teste em vez de passar batido.
  create(): never {
    throw new Error("anexar não cria publicação");
  }
  contentsOf(): never {
    throw new Error("não usado neste caminho");
  }
  listAssetKeys(): never {
    throw new Error("não usado neste caminho");
  }
  delete(): never {
    throw new Error("não usado neste caminho");
  }

  readonly escritas: PublicationWrite[] = [];

  constructor(private livro: PublicationDetail | null = LIVRO) {}

  listByWorkspaceSlug = async (): Promise<readonly PublicationSummary[]> => [];
  listByWorkspaceId = async (): Promise<readonly PublicationSummary[]> => [];
  findById = async () => this.livro;
  findDetailById = async (id: string) => (this.livro?.id === id ? this.livro : null);

  update = async (id: string, write: PublicationWrite): Promise<PublicationDetail | null> => {
    if (this.livro?.id !== id) return null;
    this.escritas.push(write);
    this.livro = { ...this.livro, ...write };
    return this.livro;
  };
}

class FakeAssets implements CatalogAssetWriter {
  readonly gravados: Parameters<CatalogAssetWriter["store"]>[0][] = [];
  /** Dedup por conteúdo, como a `storageKey` faz no Prisma: mesmo arquivo, mesma linha. */
  private readonly porConteudo = new Map<string, string>();

  store = async (input: Parameters<CatalogAssetWriter["store"]>[0]) => {
    this.gravados.push(input);

    const chave = new TextDecoder().decode(input.content);
    const existente = this.porConteudo.get(chave);
    if (existente) return { id: existente };

    const id = `asset-${this.porConteudo.size + 1}`;
    this.porConteudo.set(chave, id);
    return { id };
  };
}

/** O livro e os donos dos assets, como o banco os vê. */
class FakeSource implements PublicationSourceWriter {
  readonly pedidos: AttachSourceInput[] = [];

  constructor(
    readonly livro: { sourcePdfAssetId: string | null; coverAssetId: string | null },
    /** Dono de cada asset. Ausente é órfão — e órfão é adotado pelo livro que o anexa. */
    readonly donos: Map<string, string | null> = new Map(),
  ) {}

  attachSource = async (input: AttachSourceInput): Promise<AttachSourceResult> => {
    this.pedidos.push(input);

    const dono = this.donos.get(input.sourcePdfAssetId) ?? null;
    if (dono === null) this.donos.set(input.sourcePdfAssetId, input.publicationId);

    // O `updateMany` com a fonte esperada no `where`: quem chega com uma leitura velha não escreve.
    if (this.livro.sourcePdfAssetId !== input.expectedSourcePdfAssetId) {
      return { attached: false, ownedByBook: false };
    }

    this.livro.sourcePdfAssetId = input.sourcePdfAssetId;
    if (input.coverAssetId !== null) this.livro.coverAssetId = input.coverAssetId;

    return {
      attached: true,
      ownedByBook: (this.donos.get(input.sourcePdfAssetId) ?? null) === input.publicationId,
    };
  };
}

const anexar = async (
  over: Partial<Parameters<typeof attachFromCatalog>[1]> = {},
  mundo: {
    entries?: readonly CatalogEntry[];
    livro?: PublicationDetail | null;
    donos?: Map<string, string | null>;
  } = {},
) => {
  const entries = mundo.entries ?? [entrada()];
  const livro = mundo.livro === undefined ? LIVRO : mundo.livro;

  const publications = new FakePublications(livro);
  const assets = new FakeAssets();
  const source = new FakeSource(
    {
      sourcePdfAssetId: livro?.sourcePdfAssetId ?? null,
      coverAssetId: livro?.coverAssetId ?? null,
    },
    mundo.donos ?? new Map(),
  );

  const result = await attachFromCatalog(
    { catalog: new FakeCatalog(entries), publications, assets, source },
    {
      publicationId: "pub-1",
      externalId: entries[0]?.externalId ?? "uuid-elon-1",
      maxYear: 2027,
      ...over,
    },
  );

  return { result, publications, assets, source };
};

describe("anexar a um livro sem PDF fonte", () => {
  it("copia o PDF, liga ao livro e aponta a fonte — sem criar publicação nenhuma", async () => {
    const { result, assets, source } = await anexar();

    // Cópia, nunca referência ao caminho do Calibre (D26 · D44.4).
    expect(assets.gravados.map((item) => item.kind)).toEqual(["SOURCE_PDF"]);
    expect(assets.gravados[0]?.publicationId).toBe("pub-1");
    expect(new TextDecoder().decode(assets.gravados[0]?.content)).toBe(
      "bytes de curso-de-analise.pdf",
    );

    expect(source.livro.sourcePdfAssetId).toBe("asset-1");
    expect(result.replaced).toBeNull();
    expect(result.filename).toBe("curso-de-analise.pdf");
    expect(result.href).toBe("/publications/pub-1");
  });

  it("**não** grava a origem do catálogo — o Calibre é origem, não dono (D44.3)", async () => {
    const { result, publications, source } = await anexar({ fillMetadata: true });

    // A prova pelo que atravessou: nada do que foi escrito carrega o identificador do catálogo.
    // `PublicationWrite` nem tem `metadataJson`, e é essa ausência que o teste protege — o dia em
    // que alguém acrescentar o campo "para não perder a origem", este teste cai.
    const escrito = JSON.stringify([publications.escritas, source.pedidos, result]);
    expect(escrito).not.toContain("uuid-elon-1");
    expect(escrito).not.toContain("calibre");
  });

  it("traz a capa quando o livro não tem, e mantém a que já existe quando tem", async () => {
    const semCapa = { ...LIVRO, coverAssetId: null };
    const comCapa = await anexar();
    const nova = await anexar({}, { livro: semCapa });

    expect(comCapa.assets.gravados.map((item) => item.kind)).toEqual(["SOURCE_PDF"]);
    expect(comCapa.result.warnings.join(" ")).toContain("capa do livro foi mantida");

    expect(nova.assets.gravados.map((item) => item.kind)).toEqual(["SOURCE_PDF", "COVER"]);
    expect(nova.source.livro.coverAssetId).toBe("asset-2");
  });

  it("adota o asset órfão do mesmo arquivo — o resíduo da tentativa antiga", async () => {
    // O `createAsset` deduplica por `storageKey`, que contém o hash: anexar um PDF já subido antes
    // devolve a linha que existe. Ela é órfã no banco de dev, e é por isso que a escrita adota.
    const { result, source } = await anexar({}, { donos: new Map([["asset-1", null]]) });

    expect(source.donos.get("asset-1")).toBe("pub-1");
    expect(result.warnings.join(" ")).not.toContain("outro livro");
  });

  it("avisa quando o arquivo já pertencia a outro livro — não rouba, e não mente", async () => {
    const { result, source } = await anexar({}, { donos: new Map([["asset-1", "pub-outro"]]) });

    expect(source.livro.sourcePdfAssetId).toBe("asset-1");
    expect(source.donos.get("asset-1")).toBe("pub-outro");
    expect(result.warnings.join(" ")).toContain("já estava no acervo por outro livro");
  });
});

describe("livro que já tem PDF fonte", () => {
  const comFonte = { ...LIVRO, sourcePdfAssetId: "fonte-velha" };

  it("recusa a troca em silêncio — pergunta antes, e não copia byte nenhum", async () => {
    const promessa = anexar({}, { livro: comFonte });
    await expect(promessa).rejects.toThrow(PublicationHasSourceError);

    const { assets, source } = await anexar({ replace: true }, { livro: comFonte });
    expect(assets.gravados.length).toBeGreaterThan(0);
    expect(source.livro.sourcePdfAssetId).toBe("asset-1");
  });

  it("trocada, a anterior continua ligada ao livro — os recortes apontam para ela (D44.5)", async () => {
    const donos = new Map<string, string | null>([["fonte-velha", "pub-1"]]);
    const { result, source } = await anexar({ replace: true }, { livro: comFonte, donos });

    expect(result.replaced).toBe("fonte-velha");
    // Ninguém apagou nem desligou o asset anterior: ele continua sendo do livro, e o que mudou foi
    // apenas para onde `sourcePdfAssetId` aponta.
    expect(donos.get("fonte-velha")).toBe("pub-1");
    expect(source.livro.sourcePdfAssetId).toBe("asset-1");
  });

  it("quem perde a corrida não sobrescreve — ouve a pergunta de novo", async () => {
    // O livro dizia estar sem fonte quando foi lido, e ganhou uma antes da escrita.
    const publications = new FakePublications(LIVRO);
    const assets = new FakeAssets();
    const source = new FakeSource({ sourcePdfAssetId: "chegou-antes", coverAssetId: null });

    await expect(
      attachFromCatalog(
        { catalog: new FakeCatalog([entrada()]), publications, assets, source },
        { publicationId: "pub-1", externalId: "uuid-elon-1", maxYear: 2027 },
      ),
    ).rejects.toThrow(PublicationHasSourceError);

    expect(source.livro.sourcePdfAssetId).toBe("chegou-antes");
  });
});

describe("livro do Calibre sem PDF", () => {
  it("é recusado, com os formatos que **há** — EPUB não vira fonte fingindo ser", async () => {
    const soEpub = entrada({
      files: [{ format: "EPUB", filename: "livro.epub", sizeBytes: 1 }],
    });

    const promessa = anexar({ formats: ["PDF", "EPUB"] }, { entries: [soEpub] });
    await expect(promessa).rejects.toThrow(CatalogPdfMissingError);
    await expect(promessa).rejects.toThrow(/só EPUB/);
  });

  it("recusa antes de copiar qualquer arquivo", async () => {
    const soEpub = entrada({ files: [{ format: "EPUB", filename: "l.epub", sizeBytes: 1 }] });
    const publications = new FakePublications();
    const assets = new FakeAssets();
    const source = new FakeSource({ sourcePdfAssetId: null, coverAssetId: null });

    await expect(
      attachFromCatalog(
        { catalog: new FakeCatalog([soEpub]), publications, assets, source },
        { publicationId: "pub-1", externalId: "uuid-elon-1", maxYear: 2027 },
      ),
    ).rejects.toThrow(CatalogPdfMissingError);

    expect(assets.gravados).toEqual([]);
    expect(source.pedidos).toEqual([]);
  });
});

describe("metadados do catálogo", () => {
  it("preenchem só o que está vazio, e nunca sobrescrevem (D44.2)", async () => {
    const digitado: PublicationDetail = {
      ...LIVRO,
      publisher: "Editora que a pessoa digitou",
      editionYear: 1999,
      language: null,
      series: null,
      volume: null,
    };

    const { result, publications } = await anexar({ fillMetadata: true }, { livro: digitado });
    const escrito = publications.escritas.at(-1);

    expect(escrito?.publisher).toBe("Editora que a pessoa digitou");
    expect(escrito?.editionYear).toBe(1999);
    expect(escrito?.language).toBe("por");
    expect(escrito?.series).toBe("Projeto Euclides");
    expect(escrito?.volume).toBe("1");

    expect(result.filled.map((campo) => campo.field)).toEqual(["language", "series", "volume"]);
  });

  it("não toca em nada quando ninguém pediu", async () => {
    const { result, publications } = await anexar();

    expect(publications.escritas).toEqual([]);
    expect(result.filled).toEqual([]);
  });

  it("autores é tudo ou nada — não mescla lista de nomes", async () => {
    const semAutor = { ...LIVRO, authors: [] };

    expect(camposAPreencher(LIVRO, entrada()).map((c) => c.field)).not.toContain("authors");
    const { result } = await anexar({ fillMetadata: true }, { livro: semAutor });
    expect(result.filled.map((campo) => campo.field)).toContain("authors");
  });

  it("volume não entra sem coleção — o Calibre grava índice 1.0 em todo livro", async () => {
    const avulso = entrada({ series: null, seriesIndex: "1" });
    expect(camposAPreencher({ ...LIVRO, series: null, volume: null }, avulso).map((c) => c.field))
      .not.toContain("volume");
  });

  it("ISBN torto do catálogo vira aviso, e o resto dos campos entra", async () => {
    // O ISBN é campo livre no Calibre. Derrubar o anexo por causa dele seria perder o arquivo por
    // um dado corrigível em dois cliques — a mesma decisão que a importação já tinha tomado.
    const torto = entrada({ isbn: "9783161484101" });
    const { result, publications } = await anexar(
      { fillMetadata: true },
      { entries: [torto], livro: { ...LIVRO, language: null } },
    );

    expect(result.warnings.join(" ")).toContain("ISBN do catálogo recusado");
    expect(publications.escritas.at(-1)?.isbn).toBeNull();
    expect(publications.escritas.at(-1)?.publisher).toBe("IMPA");
    expect(result.filled.map((campo) => campo.field)).not.toContain("isbn");
  });
});

describe("o que não existe", () => {
  it("livro que não está no acervo", async () => {
    await expect(anexar({}, { livro: null })).rejects.toThrow(PublicationNotFoundError);
  });

  it("livro que sumiu do catálogo entre a lista e o clique", async () => {
    await expect(anexar({ externalId: "sumiu" })).rejects.toThrow(CatalogEntryNotFoundError);
  });
});

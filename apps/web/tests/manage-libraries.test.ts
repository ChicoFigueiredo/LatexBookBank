import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  createLibrary,
  deleteLibrary,
  renameLibrary,
} from "@modules/workspaces/application/manage-libraries";
import {
  DuplicateLibraryError,
  LibraryConfirmationMismatchError,
  InvalidLibraryNameError,
  LibraryNotFoundError,
  normalizeLibraryName,
  slugifyLibrary,
  uniqueSlug,
} from "@modules/workspaces/domain/library";
import type {
  LibraryContents,
  LibraryRepository,
  LibrarySummary,
} from "@modules/workspaces/domain/library-repository";
import type { StorageKey, StorageProvider } from "@/shared/ports";

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

  private push(name: string, slug: string, description: string | null = null): LibrarySummary {
    const row: LibrarySummary = {
      id: `lib-${++this.seq}`,
      name,
      slug,
      description,
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

  create = async (input: { name: string; slug: string; description: string | null }) =>
    this.push(input.name, input.slug, input.description);

  rename = async (id: string, name: string) => {
    const row = this.rows.find((entry) => entry.id === id);
    if (!row) return null;

    const renamed = { ...row, name };
    this.rows = this.rows.map((entry) => (entry.id === id ? renamed : entry));
    return renamed;
  };

  /** Conteúdo declarado por id, para os testes de exclusão dizerem o que existe dentro. */
  contents = new Map<string, LibraryContents>();
  assetKeys = new Map<string, readonly string[]>();
  /** Ordem das operações, para provar que o arquivo sai **depois** do banco. */
  readonly trace: string[] = [];

  contentsOf = async (id: string): Promise<LibraryContents | null> =>
    this.rows.some((row) => row.id === id)
      ? (this.contents.get(id) ?? { publicationCount: 0, questionCount: 0, assetCount: 0 })
      : null;

  listAssetKeys = async (id: string): Promise<readonly string[]> => this.assetKeys.get(id) ?? [];

  delete = async (id: string): Promise<boolean> => {
    if (!this.rows.some((row) => row.id === id)) return false;

    this.trace.push(`delete:${id}`);
    this.rows = this.rows.filter((row) => row.id !== id);
    return true;
  };
}

class FakeStorage implements StorageProvider {
  readonly deleted: string[] = [];
  /** Chaves que falham ao apagar — arquivo preso pelo antivírus, disco de rede fora do ar. */
  failing = new Set<string>();

  constructor(private readonly trace: string[] = []) {}

  put = async () => {
    throw new Error("não usado");
  };
  get = async () => {
    throw new Error("não usado");
  };
  exists = async () => false;

  delete = async (key: StorageKey): Promise<void> => {
    this.trace.push(`storage:${String(key)}`);
    if (this.failing.has(String(key))) throw new Error("EBUSY");
    this.deleted.push(String(key));
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

  it("**aceita** nome repetido e desambigua o slug", async () => {
    // O protótipo do Beta Editorial define nome repetido como aviso, não recusa. Quem tem o mesmo
    // acervo em duas máquinas tem motivo legítimo para repetir; o que precisa continuar distinto é
    // o endereço, e disso cuida `uniqueSlug`.
    const repository = new FakeLibraries([{ name: "Concursos", slug: "concursos" }]);

    const segunda = await createLibrary(repository, { name: "CONCURSOS" });

    expect(segunda.name).toBe("CONCURSOS");
    expect(segunda.slug).toBe("concursos-2");
  });

  it("guarda a descrição, e trata vazia como ausente", async () => {
    const repository = new FakeLibraries();

    const comTexto = await createLibrary(repository, {
      name: "Com descrição",
      description: "  Provas de concurso   público ",
    });
    const semTexto = await createLibrary(repository, { name: "Sem descrição", description: "   " });
    const omitida = await createLibrary(repository, { name: "Omitida" });

    expect(comTexto.description).toBe("Provas de concurso público");
    // `""` e `null` seriam dois jeitos de não ter descrição, e toda leitura pagaria por isso.
    expect(semTexto.description).toBeNull();
    expect(omitida.description).toBeNull();
  });

  it("recusa descrição que não é texto ou que estoura o limite", async () => {
    const repository = new FakeLibraries();

    await expect(createLibrary(repository, { name: "X", description: 42 })).rejects.toThrow(
      InvalidLibraryNameError,
    );
    await expect(
      createLibrary(repository, { name: "Y", description: "a".repeat(401) }),
    ).rejects.toThrow(InvalidLibraryNameError);
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

describe("excluir biblioteca", () => {
  /** Uma biblioteca com dois arquivos, pronta para ser apagada. */
  async function comConteudo() {
    const repository = new FakeLibraries();
    const library = await createLibrary(repository, { name: "Acervo de Teste" });

    repository.contents.set(library.id, {
      publicationCount: 1,
      questionCount: 12,
      assetCount: 2,
    });
    repository.assetKeys.set(library.id, [`${library.id}/ab/abc.png`, `${library.id}/cd/cde.pdf`]);

    const storage = new FakeStorage(repository.trace);
    return { repository, storage, library };
  }

  it("apaga a biblioteca e os arquivos dela quando o nome confere", async () => {
    const { repository, storage, library } = await comConteudo();

    const deleted = await deleteLibrary(repository, storage, library.id, {
      name: "Acervo de Teste",
    });

    expect(deleted).toMatchObject({ name: "Acervo de Teste", questionCount: 12 });
    expect(await repository.findById(library.id)).toBeNull();
    expect(storage.deleted).toHaveLength(2);
  });

  it("apaga o banco **antes** do storage", async () => {
    // Na ordem inversa, uma falha no meio deixaria linha apontando para arquivo que já não
    // existe — e aí a tela quebra ao abrir. Órfão no disco é invisível e varrível.
    const { repository, storage, library } = await comConteudo();

    await deleteLibrary(repository, storage, library.id, { name: "Acervo de Teste" });

    expect(repository.trace[0]).toBe(`delete:${library.id}`);
    expect(repository.trace.slice(1).every((step) => step.startsWith("storage:"))).toBe(true);
  });

  it("não recusa a exclusão quando um arquivo não sai do disco", async () => {
    const { repository, storage, library } = await comConteudo();
    storage.failing.add(`${library.id}/ab/abc.png`);

    await expect(
      deleteLibrary(repository, storage, library.id, { name: "Acervo de Teste" }),
    ).resolves.toMatchObject({ name: "Acervo de Teste" });

    // A biblioteca já não existe: dizer "não deu para excluir" seria mentira, e mandaria o
    // usuário tentar de novo contra um id que sumiu.
    expect(await repository.findById(library.id)).toBeNull();
    expect(storage.deleted).toEqual([`${library.id}/cd/cde.pdf`]);
  });

  it("recusa quando o nome digitado não confere — e não apaga nada", async () => {
    const { repository, storage, library } = await comConteudo();

    await expect(
      deleteLibrary(repository, storage, library.id, { name: "acervo de teste" }),
    ).rejects.toThrow(LibraryConfirmationMismatchError);

    // Caixa diferente é recusada de propósito: `existsByName` compara frouxo para impedir
    // duplicata, mas aqui a comparação frouxa trabalharia contra o ponto de digitar o nome.
    expect(await repository.findById(library.id)).not.toBeNull();
    expect(storage.deleted).toHaveLength(0);
  });

  it("perdoa espaço em excesso na confirmação", async () => {
    const { repository, storage, library } = await comConteudo();

    await expect(
      deleteLibrary(repository, storage, library.id, { name: "  Acervo   de Teste " }),
    ).resolves.toMatchObject({ name: "Acervo de Teste" });
  });

  it("recusa confirmação que não é texto", async () => {
    const { repository, storage, library } = await comConteudo();

    await expect(
      deleteLibrary(repository, storage, library.id, { name: undefined }),
    ).rejects.toThrow(LibraryConfirmationMismatchError);
  });

  it("recusa id inexistente antes de pedir confirmação", async () => {
    const repository = new FakeLibraries();

    await expect(
      deleteLibrary(repository, new FakeStorage(), "nao-existe", { name: "qualquer" }),
    ).rejects.toThrow(LibraryNotFoundError);
  });

  it("apaga biblioteca vazia sem tocar no storage", async () => {
    const repository = new FakeLibraries();
    const library = await createLibrary(repository, { name: "Vazia" });
    const storage = new FakeStorage();

    const deleted = await deleteLibrary(repository, storage, library.id, { name: "Vazia" });

    expect(deleted).toMatchObject({ publicationCount: 0, questionCount: 0, assetCount: 0 });
    expect(storage.deleted).toHaveLength(0);
  });
});

describe("as arestas que a exclusão precisa desviar", () => {
  /**
   * `ON DELETE RESTRICT` é o que faz a cascata **abortar** em vez de descer, e é por isso que
   * `PrismaLibraryRepository.delete` apaga avaliações e âncoras antes de mexer no resto.
   *
   * A leitura é do SQL das migrations, não do `schema.prisma`, e a diferença é exatamente o que
   * custou uma violação de FK contra o banco de desenvolvimento: o schema declara **uma** aresta
   * `Restrict`, e o banco tem **duas** (hoje três, com a do scan). A segunda é o default do Prisma para relação obrigatória
   * sem `onDelete` — invisível em quem lê o schema, e alcançada só por um caminho de três saltos
   * (questão → render job → asset → âncora).
   *
   * Não impede acrescentar uma terceira; impede acrescentá-la **sem revisitar a ordem da
   * exclusão**, que é como a segunda passou despercebida.
   */
  const migrationsDir = fileURLToPath(new URL("../prisma/migrations", import.meta.url));

  /** Última definição de cada constraint, na ordem em que as migrations rodam. */
  const acaoPorConstraint = new Map<string, string>();

  for (const entry of readdirSync(migrationsDir).sort()) {
    const file = path.join(migrationsDir, entry, "migration.sql");
    if (!existsSync(file)) continue;

    const sql = readFileSync(file, "utf8");
    for (const [, nome, acao] of sql.matchAll(
      /CONSTRAINT "(\w+)" FOREIGN KEY[\s\S]*?ON DELETE (\w+)/g,
    )) {
      if (nome && acao) acaoPorConstraint.set(nome, acao);
    }
  }

  it("são exatamente três, e são as que a ordem da exclusão conhece", () => {
    const restritas = [...acaoPorConstraint]
      .filter(([, acao]) => acao === "RESTRICT")
      .map(([nome]) => nome)
      .sort();

    expect(restritas).toEqual([
      // Apagar questão que está numa avaliação — desviada apagando as avaliações primeiro.
      "assessment_items_questionId_fkey",
      // Apagar o PDF fonte que uma execução de scan varreu — desviada apagando as execuções (D51).
      "scan_runs_sourceAssetId_fkey",
      // Apagar asset que é a origem de uma âncora — desviada apagando as âncoras primeiro.
      "source_anchors_sourceAssetId_fkey",
    ]);
  });
});

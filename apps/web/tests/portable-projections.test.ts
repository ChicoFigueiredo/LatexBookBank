import { describe, expect, it } from "vitest";

import {
  toPortable,
  type RuntimeWorkspace,
} from "@modules/portability/application/export-workspace";
import { toRuntime } from "@modules/portability/application/import-workspace";
import { readArchive, writeArchive } from "@modules/portability/domain/portable-archive";

/**
 * As duas projeções, e o round-trip que as exercita juntas.
 *
 * O aceite da fase pede identidade — não semelhança. Um formato que perde um campo por caminho
 * perde o campo de todo mundo que exportou naquele dia, e a descoberta acontece meses depois,
 * quando alguém tenta restaurar.
 */

const runtime = (over: Partial<RuntimeWorkspace> = {}): RuntimeWorkspace => ({
  name: "Matemática Financeira",
  slug: "matematica-financeira",
  tags: [
    { name: "juros simples", kind: "TOPIC" },
    { name: "álgebra", kind: "SUBJECT" },
  ],
  publications: [
    {
      id: "uuid-pub-aaaa",
      title: "Juros e Descontos",
      subtitle: "3ª edição",
      publisher: "Cesgranrio",
      // A ficha catalográfica inteira. Ela **não atravessava**: o `.lbb` levava título, subtítulo
      // e editora, e o backup devolvia o livro sem ISBN, edição, volume, série nem autores — o
      // trabalho de quem cataloga, perdido no caminho de ida e volta que a tela chama de "a cópia".
      nickname: "JD 3",
      isbn: "978-85-357-0011-4",
      otherIdentifier: "CDD 332.8",
      edition: "3ª",
      editionYear: 2019,
      language: "pt-BR",
      series: "Concursos",
      volume: "2",
      notes: "exemplar anotado",
      authors: ["Iezzi, Gelson", "Murakami, Carlos"],
      legacyId: 7,
      legacyUuid: "legacy-uuid-1",
      metadataJson: '{"series":"concursos"}',
      coverAssetSha256: "aa11",
      sourcePdfAssetSha256: "bb22",
      nodes: [
        {
          id: "uuid-node-1",
          parentId: null,
          kind: "CHAPTER",
          title: "Juros Simples",
          sortKey: "a0",
          numberingStyle: "ROMAN",
          originalLabel: "I",
          legacyId: 100,
          question: null,
          bodyLatex: "Juros simples incidem só sobre o capital.",
          anchors: [
            {
              sha256: "bb22",
              pageNumber: 12,
              box: { x: 0.1, y: 0.2, width: 0.8, height: 0.05 },
              role: "PRIMARY",
              sourceText: "Capítulo I — Juros Simples",
              extractionMethod: "scan:book-v1@1",
              extractionModel: null,
            },
          ],
        },
        {
          id: "uuid-node-2",
          parentId: "uuid-node-1",
          kind: "QUESTION",
          title: null,
          sortKey: "a1",
          numberingStyle: "ARABIC",
          originalLabel: "1",
          legacyId: 101,
          bodyLatex: "",
          anchors: [],
          question: {
            id: "uuid-q-1",
            type: "MULTIPLE_CHOICE",
            nickname: "Montante à vista",
            statementLatex: "Um capital de \\SI{1000}{\\real} à taxa de 2\\%",
            solutionLatex: "M = C(1+it)",
            complementLatex: "",
            originalLatex: null,
            difficulty: 2,
            year: 2014,
            board: "Cesgranrio",
            institution: null,
            role: null,
            roleLevel: null,
            publisher: null,
            videoUrl: null,
            status: "DRAFT",
            validationStatus: "VALID",
            legacyId: 101,
            tags: ["juros simples"],
            assetSha256: ["bb22", "aa11"],
            options: [
              {
                id: "uuid-o-1",
                sortKey: "a0",
                statementLatex: "\\SI{1020}{\\real}",
                solutionLatex: "",
                originalLatex: null,
                isCorrect: false,
                weight: null,
                legacyId: 1,
                legacyMarcacao: "a",
              },
              {
                id: "uuid-o-2",
                sortKey: "a1",
                statementLatex: "\\SI{1060}{\\real}",
                solutionLatex: "",
                originalLatex: null,
                isCorrect: true,
                weight: 1,
                legacyId: 2,
                legacyMarcacao: "b",
              },
            ],
          },
        },
      ],
    },
  ],
  ...over,
});

/** Runtime → portable → runtime, sem passar pelo zip: isola as projeções. */
const roundTrip = (source: RuntimeWorkspace) => toRuntime(toPortable(source)).workspace;

describe("runtime → portable", () => {
  it("os uuids de runtime **não** atravessam", () => {
    // Importar num workspace que já tem um deles seria colisão inventada, e mantê-los amarraria o
    // arquivo ao banco que o gerou.
    const portable = toPortable(runtime());
    const serialized = JSON.stringify(portable);

    expect(serialized).not.toContain("uuid-pub-aaaa");
    expect(serialized).not.toContain("uuid-q-1");
    expect(portable.publications[0]?.ref).toBe("pub-1");
  });

  it("`legacyId` e `legacyUuid` atravessam — são identidade de origem", () => {
    const portable = toPortable(runtime());

    expect(portable.publications[0]?.legacyId).toBe(7);
    expect(portable.publications[0]?.legacyUuid).toBe("legacy-uuid-1");
  });

  it("o pai vira `parentRef` dentro do arquivo", () => {
    const nodes = toPortable(runtime()).publications[0]?.nodes ?? [];

    expect(nodes[0]?.parentRef).toBeNull();
    expect(nodes[1]?.parentRef).toBe(nodes[0]?.ref);
  });

  it("duas exportações do mesmo workspace saem **iguais**", () => {
    // Um uuid novo por item funcionaria igual e impediria comparar dois arquivos para ver se algo
    // mudou.
    expect(JSON.stringify(toPortable(runtime()))).toBe(JSON.stringify(toPortable(runtime())));
  });

  it("tags e assets saem ordenados — a ordem do banco não é garantida", () => {
    const portable = toPortable(runtime());

    expect(portable.tags.map((tag) => tag.name)).toEqual(["álgebra", "juros simples"]);
    expect(portable.publications[0]?.nodes[1]?.question?.assets).toEqual(["aa11", "bb22"]);
  });
});

describe("round-trip das projeções", () => {
  /**
   * A ficha catalográfica sobrevive ao backup.
   *
   * Este era o buraco: `toPortable` carregava título, subtítulo e editora, e o `.lbb` — que a tela
   * de importar chama de "a cópia" — devolvia o livro sem apelido, ISBN, edição, ano, idioma,
   * série, volume, notas nem autores. Quem exportasse uma biblioteca e a restaurasse recuperava os
   * textos das questões e perdia a catalogação inteira, que é o trabalho mais lento de todos.
   */
  it("preserva a ficha catalográfica inteira, autores inclusive", () => {
    const [livro] = roundTrip(runtime()).publications;

    expect(livro).toMatchObject({
      nickname: "JD 3",
      isbn: "978-85-357-0011-4",
      otherIdentifier: "CDD 332.8",
      edition: "3ª",
      editionYear: 2019,
      language: "pt-BR",
      series: "Concursos",
      volume: "2",
      notes: "exemplar anotado",
    });

    // Na ordem em que assinam: quem assina primeiro assina primeiro, e é dela que a estante tira
    // "Iezzi e outros".
    expect(livro?.authors).toEqual(["Iezzi, Gelson", "Murakami, Carlos"]);
  });

  it("arquivo gravado antes destes campos continua importando", () => {
    // O `.lbb` de ontem não tem a ficha. Ausente vira `null`, e o import não recusa — recusar o
    // backup de alguém por ele ser antigo é o oposto do que um formato de portabilidade faz.
    const portable = toPortable(runtime());
    const antigo = {
      ...portable,
      // A ficha é removida do arquivo para simular o `.lbb` de ontem. `Omit` em vez de
      // desestruturação porque o lint recusa dez variáveis declaradas e não usadas — e ele está
      // certo: o que interessa aqui é o que **fica**, não o que sai.
      publications: portable.publications.map((publicacao) => {
        const copia: Record<string, unknown> = { ...publicacao };
        for (const campo of [
          "nickname", "isbn", "otherIdentifier", "edition", "editionYear",
          "language", "series", "volume", "notes", "authors",
        ]) {
          delete copia[campo];
        }
        return copia as unknown as (typeof portable.publications)[number];
      }),
    };

    const [livro] = toRuntime(antigo).workspace.publications;

    expect(livro?.title).toBe("Juros e Descontos");
    expect(livro?.isbn).toBeNull();
    expect(livro?.authors).toEqual([]);
  });

  it("**projetar o resultado de novo dá o mesmo arquivo**", () => {
    // A identidade que importa não é entre os dois runtimes: os ids mudam de propósito, e a
    // projeção ordena tags e assets. É entre os dois **portables** — se a ida e a volta não
    // perderam nada, projetar o resultado outra vez produz byte a byte o mesmo formato.
    const source = runtime();
    const first = toPortable(source);
    const second = toPortable(roundTrip(source));

    expect(second).toEqual(first);
  });

  it("nenhum campo some pelo caminho", () => {
    // A checagem grosseira que pega o esquecimento mais comum: um campo novo no runtime que
    // ninguém acrescentou à projeção some em silêncio, e só aparece meses depois.
    const source = runtime();
    const back = roundTrip(source);

    const keysOf = (value: unknown): string[] =>
      typeof value === "object" && value !== null
        ? Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)])
        : [];

    const before = new Set(keysOf(source));
    for (const key of keysOf(back)) before.delete(key);

    expect([...before]).toEqual([]);
  });

  it("o gabarito sobrevive à ida e à volta", () => {
    const options = roundTrip(runtime()).publications[0]?.nodes[1]?.question?.options ?? [];

    expect(options.filter((option) => option.isCorrect)).toHaveLength(1);
    expect(options.find((option) => option.isCorrect)?.legacyId).toBe(2);
  });

  it("a relação pai-filho sobrevive", () => {
    const nodes = roundTrip(runtime()).publications[0]?.nodes ?? [];

    expect(nodes[0]?.parentId).toBeNull();
    expect(nodes[1]?.parentId).toBe(nodes[0]?.id);
  });

  it("acento, `\\` e chave atravessam intactos", () => {
    const question = roundTrip(runtime()).publications[0]?.nodes[1]?.question;

    expect(question?.statementLatex).toBe("Um capital de \\SI{1000}{\\real} à taxa de 2\\%");
    expect(question?.nickname).toBe("Montante à vista");
  });

  it("`null` continua `null`, e não vira string vazia", () => {
    // `""` e "sem valor" são coisas diferentes: um complemento vazio é um campo preenchido com
    // nada; um `originalLatex` nulo é uma questão que nunca teve origem registrada.
    const question = roundTrip(runtime()).publications[0]?.nodes[1]?.question;

    expect(question?.originalLatex).toBeNull();
    expect(question?.complementLatex).toBe("");
  });
});

describe("round-trip pelo arquivo inteiro", () => {
  it("exportar, escrever o zip, ler e importar dá o mesmo conteúdo", async () => {
    const source = runtime();
    const portable = toPortable(source);

    const archive = await writeArchive({
      workspace: portable,
      assets: [],
      appVersion: "0.0.0-test",
      exportedAt: "2026-08-10T00:00:00.000Z",
    });

    const { workspace: readBack } = await readArchive(archive);
    expect(readBack).toEqual(portable);

    const imported = toRuntime(readBack).workspace;
    expect(imported.publications[0]?.title).toBe("Juros e Descontos");
    expect(imported.publications[0]?.nodes[1]?.question?.options).toHaveLength(2);
  });
});

describe("colisões — nada é sobrescrito em silêncio", () => {
  it("publicação com o mesmo `legacyId` no destino vira colisão relatada", () => {
    // Um import que atualizasse por conta própria transformaria "trazer um acervo" em
    // "sobrescrever o meu", e a diferença só apareceria depois de o trabalho de alguém sumir.
    const plan = toRuntime(toPortable(runtime()), {
      publicationsByLegacyId: new Map([[7, "id-existente"]]),
      publicationsByLegacyUuid: new Map(),
      publicationsByIsbn: new Map(),
      questionsByLegacyId: new Map(),
    });

    expect(plan.collisions).toContainEqual({
      kind: "publication",
      by: "legacyId",
      value: 7,
      existingId: "id-existente",
    });
  });

  it("**ISBN** também colide — a chave que funciona para livro nascido no app", () => {
    /*
     * `legacyId` e `legacyUuid` são identidade de **origem**: só existem em quem veio do sistema
     * legado. Um livro cadastrado no app hoje, exportado e reimportado, não colidia por chave
     * nenhuma — duplicava em silêncio, e a simulação dizia "0 conflitos" com toda a razão e
     * nenhuma utilidade.
     *
     * O ISBN é o identificador que a pessoa digitou, e significa "é este livro" fora deste banco.
     */
    const plan = toRuntime(toPortable(runtime()), {
      publicationsByLegacyId: new Map(),
      publicationsByLegacyUuid: new Map(),
      // Sem hífen no índice, com hífen no arquivo: é assim que a ficha catalográfica escreve, e
      // comparar sem normalizar deixaria passar a duplicata mais óbvia que existe.
      publicationsByIsbn: new Map([["9788535700114", "id-mesmo-livro"]]),
      questionsByLegacyId: new Map(),
    });

    expect(plan.collisions).toContainEqual({
      kind: "publication",
      by: "isbn",
      value: "9788535700114",
      existingId: "id-mesmo-livro",
    });
  });

  it("livro sem ISBN e sem chave legada não colide — e está certo", () => {
    // Não há nada que diga que é o mesmo livro. Inventar uma colisão a partir do título faria o
    // painel acusar conflito entre dois volumes diferentes da mesma coleção.
    const semChaves = runtime();
    const publicacao = semChaves.publications[0];
    const plan = toRuntime(
      toPortable({
        ...semChaves,
        publications: [{ ...publicacao!, legacyId: null, legacyUuid: null, isbn: null }],
      }),
      {
        publicationsByLegacyId: new Map(),
        publicationsByLegacyUuid: new Map(),
        publicationsByIsbn: new Map([["9788535700114", "outro"]]),
        questionsByLegacyId: new Map(),
      },
    );

    expect(plan.collisions).toEqual([]);
  });

  it("questão com o mesmo `legacyId` também é relatada", () => {
    const plan = toRuntime(toPortable(runtime()), {
      publicationsByLegacyId: new Map(),
      publicationsByLegacyUuid: new Map(),
      publicationsByIsbn: new Map(),
      questionsByLegacyId: new Map([[101, "q-existente"]]),
    });

    expect(plan.collisions.map((entry) => entry.kind)).toEqual(["question"]);
  });

  it("destino vazio não gera colisão nenhuma", () => {
    expect(toRuntime(toPortable(runtime())).collisions).toEqual([]);
  });

  it("o plano existe mesmo com colisão — quem decide é quem chamou", () => {
    const plan = toRuntime(toPortable(runtime()), {
      publicationsByLegacyId: new Map([[7, "id-existente"]]),
      publicationsByLegacyUuid: new Map(),
      publicationsByIsbn: new Map(),
      questionsByLegacyId: new Map(),
    });

    expect(plan.workspace.publications).toHaveLength(1);
  });
});

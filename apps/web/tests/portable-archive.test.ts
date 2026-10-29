import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
  ArchiveTooLargeError,
  DEFAULT_ARCHIVE_LIMITS,
  ExportTooLargeError,
  MAX_ARCHIVE_BYTES,
  readArchive,
  sha256Of,
  writeArchive,
  type ArchiveAsset,
} from "@modules/portability/domain/portable-archive";
import {
  assertKnownVersion,
  assetPath,
  CorruptArchiveError,
  PORTABLE_FORMAT_VERSION,
  RetiredFormatVersionError,
  UnknownFormatVersionError,
  type PortableWorkspace,
} from "@modules/portability/domain/portable-schema";

/**
 * O aceite da fase é o round-trip: exportar, importar num vazio, comparar, e dar **identidade**.
 *
 * Não "parecido". Um formato de intercâmbio que perde um campo por caminho perde o campo de todo
 * mundo que exportou naquele dia, e a descoberta acontece meses depois, quando alguém tenta
 * restaurar.
 */

const bytesOf = (text: string) => new TextEncoder().encode(text);

const workspace = (over: Partial<PortableWorkspace> = {}): PortableWorkspace => ({
  name: "Matemática Financeira",
  slug: "matematica-financeira",
  description: null,
  legacyId: null,
  legacySourcePath: null,
  assessments: [],
  templates: [],
  revisions: [],
  tags: [{ name: "juros simples", kind: "TOPIC" }],
  publications: [
    {
      ref: "pub-1",
      title: "Juros e Descontos",
      subtitle: null,
      publisher: "Cesgranrio",
      nickname: null,
      isbn: null,
      otherIdentifier: null,
      edition: null,
      editionYear: null,
      publicationDate: null,
      language: null,
      series: null,
      volume: null,
      notes: null,
      authors: [],
      captureProfileId: null,
      legacyId: 7,
      legacyUuid: "b3f1-…",
      legacyUpdatedAt: null,
      metadataJson: '{"series":"concursos"}',
      assets: [],
      coverAsset: null,
      sourcePdfAsset: null,
      nodes: [
        {
          ref: "node-1",
          parentRef: null,
          kind: "CHAPTER",
          title: "Juros Simples",
          slug: null,
          sortKey: "a0",
          numberingStyle: "ROMAN",
          originalLabel: "I",
          legacyId: 100,
          deletedAt: null,
          bodyLatex: "",
          anchors: [],
          question: null,
        },
        {
          ref: "node-2",
          parentRef: "node-1",
          kind: "QUESTION",
          title: null,
          slug: null,
          sortKey: "a1",
          numberingStyle: "ARABIC",
          originalLabel: "1",
          legacyId: 101,
          deletedAt: null,
          bodyLatex: "",
          anchors: [],
          question: {
            ref: "q-1",
            type: "MULTIPLE_CHOICE",
            nickname: "Montante à vista",
            statementLatex: "Um capital de \\SI{1000}{\\real} à taxa de 2\\%",
            solutionLatex: "M = C(1+it)",
            complementLatex: "",
            originalLatex: "Um capital de R$ 1000",
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
            options: [
              {
                ref: "o-1",
                sortKey: "a0",
                statementLatex: "\\SI{1020}{\\real}",
                solutionLatex: "",
                originalLatex: null,
                isCorrect: false,
                weight: null,
                legacyId: 1,
                legacyMarcacao: null,
              },
              {
                ref: "o-2",
                sortKey: "a1",
                statementLatex: "\\SI{1060}{\\real}",
                solutionLatex: "",
                originalLatex: null,
                isCorrect: true,
                weight: null,
                legacyId: 2,
                legacyMarcacao: null,
              },
            ],
            assets: [],
          },
        },
      ],
    },
  ],
  ...over,
});

const write = (
  over: Partial<Parameters<typeof writeArchive>[0]> = {},
  limits?: Parameters<typeof writeArchive>[1],
) =>
  writeArchive(
    {
      workspace: workspace(),
      assets: [],
      appVersion: "0.0.0-test",
      exportedAt: "2026-08-10T00:00:00.000Z",
      ...over,
    },
    limits,
  );

describe("round-trip", () => {
  it("exportar e importar devolve o workspace **idêntico**", async () => {
    const original = workspace();
    const archive = await writeArchive({
      workspace: original,
      assets: [],
      appVersion: "0.0.0-test",
      exportedAt: "2026-08-10T00:00:00.000Z",
    });

    const { workspace: restored } = await readArchive(archive);
    expect(restored).toEqual(original);
  });

  it("acento, `\\` e chave atravessam intactos", async () => {
    // O acervo é em português e cheio de LaTeX. Um `\\` que vira `\` corrompe a questão em
    // silêncio — e ninguém confere caractere a caractere um enunciado que já parece certo.
    const original = workspace();
    const { workspace: restored } = await readArchive(await write({ workspace: original }));

    const question = restored.publications[0]?.nodes[1]?.question;
    expect(question?.statementLatex).toBe("Um capital de \\SI{1000}{\\real} à taxa de 2\\%");
    expect(question?.nickname).toBe("Montante à vista");
  });

  it("o gabarito sobrevive — exatamente uma correta, e a mesma", async () => {
    const { workspace: restored } = await readArchive(await write());
    const options = restored.publications[0]?.nodes[1]?.question?.options ?? [];

    expect(options.filter((option) => option.isCorrect)).toHaveLength(1);
    expect(options.find((option) => option.isCorrect)?.ref).toBe("o-2");
  });

  it("o manifesto conta o que está lá dentro", async () => {
    const { manifest } = await readArchive(await write());

    expect(manifest.counts).toEqual({
      publications: 1,
      nodes: 2,
      questions: 1,
      options: 2,
      assets: 0,
    });
    expect(manifest.formatVersion).toBe(PORTABLE_FORMAT_VERSION);
  });
});

describe("assets endereçados por conteúdo", () => {
  const assetOf = async (text: string, extension: string): Promise<ArchiveAsset> => ({
    sha256: await sha256Of(bytesOf(text)),
    extension,
    bytes: bytesOf(text),
  });

  it("o mesmo conteúdo entra **uma** vez, mesmo referenciado várias", async () => {
    // A mesma figura em cinco questões vira um arquivo. É deduplicação de graça, e a razão de o
    // endereço ser o hash.
    const figure = await assetOf("conteúdo da figura", ".svg");
    const archive = await write({ assets: [figure, figure, figure] });

    const { assets, manifest } = await readArchive(archive);
    expect(assets).toHaveLength(1);
    expect(manifest.counts.assets).toBe(1);
  });

  it("o caminho no zip vem do hash, não do nome original", async () => {
    // Um arquivo que carregasse caminhos amarraria o import à árvore de diretórios de quem
    // exportou.
    const figure = await assetOf("x", ".png");
    const files = unzipSync(await write({ assets: [figure] }));

    expect(Object.keys(files)).toContain(assetPath(figure.sha256, ".png"));
    expect(Object.keys(files).some((path) => path.includes("figura"))).toBe(false);
  });

  it("os dois primeiros caracteres do hash viram diretório", () => {
    // Dez mil assets num diretório só é lento de listar em qualquer sistema de arquivos — e o zip
    // é extraído em algum.
    expect(assetPath("abcdef0123", ".svg")).toBe("assets/ab/abcdef0123.svg");
    expect(assetPath("abcdef0123", "svg")).toBe("assets/ab/abcdef0123.svg");
    expect(assetPath("abcdef0123", "")).toBe("assets/ab/abcdef0123");
  });

  it("os bytes voltam byte a byte", async () => {
    const figure = await assetOf("linha 1\nlinha 2 — com acento", ".txt");
    const { assets } = await readArchive(await write({ assets: [figure] }));

    expect(new TextDecoder().decode(assets[0]?.bytes)).toBe("linha 1\nlinha 2 — com acento");
  });
});

describe("o que é recusado", () => {
  it("versão futura é recusada, **nunca adivinhada**", async () => {
    // Ler errado é pior que não ler: o usuário ficaria com um workspace parcialmente importado,
    // plausível o bastante para ninguém desconfiar.
    expect(() => assertKnownVersion(PORTABLE_FORMAT_VERSION + 1)).toThrow(UnknownFormatVersionError);
    expect(() => assertKnownVersion("1")).toThrow(UnknownFormatVersionError);
    expect(() => assertKnownVersion(undefined)).toThrow(UnknownFormatVersionError);
  });

  it("a mensagem diz o que fazer, não só que falhou", () => {
    try {
      assertKnownVersion(99);
      expect.unreachable("deveria recusar");
    } catch (error) {
      expect((error as Error).message).toMatch(/Atualize o aplicativo/);
      expect((error as Error).message).toMatch(/não é aberto por tentativa/);
    }
  });

  it("dado adulterado é pego pelo checksum", async () => {
    const archive = await write();
    const files = unzipSync(archive);
    files["data.json"] = bytesOf('{"name":"outro","slug":"outro","publications":[],"tags":[]}');

    await expect(readArchive(zipSync(files))).rejects.toThrow(CorruptArchiveError);
  });

  it("asset adulterado é pego pelo hash do próprio nome", async () => {
    // O nome do arquivo **é** a afirmação de qual é o conteúdo. Conferir impede um zip adulterado
    // de entregar outra figura com o mesmo nome.
    const sha = await sha256Of(bytesOf("original"));
    const archive = await write({
      assets: [{ sha256: sha, extension: ".svg", bytes: bytesOf("original") }],
    });

    const files = unzipSync(archive);
    files[assetPath(sha, ".svg")] = bytesOf("trocado");

    await expect(readArchive(zipSync(files))).rejects.toThrow(/asset/);
  });

  it("asset que o manifesto declara e não está no zip é recusado", async () => {
    const sha = await sha256Of(bytesOf("some"));
    const archive = await write({
      assets: [{ sha256: sha, extension: ".svg", bytes: bytesOf("some") }],
    });

    const files = unzipSync(archive);
    delete files[assetPath(sha, ".svg")];

    await expect(readArchive(zipSync(files))).rejects.toThrow(/ausente/);
  });

  it("zip sem manifesto é recusado", async () => {
    const files = unzipSync(await write());
    delete files["manifest.json"];

    await expect(readArchive(zipSync(files))).rejects.toThrow(CorruptArchiveError);
  });

  it("a versão é conferida **antes** do checksum", async () => {
    // Um arquivo de versão futura pode ter checksum válido e conteúdo que este código leria
    // errado; verificar integridade primeiro responderia "está íntegro" sobre algo ilegível.
    const files = unzipSync(await write());
    const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"] as Uint8Array));

    files["manifest.json"] = bytesOf(JSON.stringify({ ...manifest, formatVersion: 42 }));
    files["data.json"] = bytesOf("dado adulterado também");

    await expect(readArchive(zipSync(files))).rejects.toThrow(UnknownFormatVersionError);
  });
});

/**
 * O `.lbb` vem de fora — de outra máquina, de alguém, de um site que o planta (SEC-03, #270). Ler
 * o zip inteiro para a memória antes de olhar o que ele diz ser é o que deixa um arquivo de 1 MB
 * pedir 20 GB ao processo.
 */
describe("o que entra no zip tem teto e lista fechada (#270)", () => {
  /** Troca o tamanho descompactado declarado de uma entrada, no cabeçalho local e no central. */
  const lieAboutSize = (zip: Uint8Array, name: string, declared: number) => {
    const copy = zip.slice();
    const view = new DataView(copy.buffer);
    const decoder = new TextDecoder();
    for (let at = 0; at < copy.length - 46; at++) {
      const signature = view.getUint32(at, true);
      if (signature === 0x04034b50) {
        const length = view.getUint16(at + 26, true);
        if (decoder.decode(copy.subarray(at + 30, at + 30 + length)) === name) view.setUint32(at + 22, declared, true);
      }
      if (signature === 0x02014b50) {
        const length = view.getUint16(at + 28, true);
        if (decoder.decode(copy.subarray(at + 46, at + 46 + length)) === name) view.setUint32(at + 24, declared, true);
      }
    }
    return copy;
  };

  const withExtra = async (name: string, content: Uint8Array<ArrayBuffer>) => {
    const files = unzipSync(await write());
    files[name] = content;
    return zipSync(files);
  };

  it.each(["leia-me.sh", "../fora.txt", "assets/ab/nao-e-hash.png"])(
    "entrada fora da lista é recusada: %s",
    async (name) => {
      await expect(readArchive(await withExtra(name, bytesOf("x")))).rejects.toThrow(CorruptArchiveError);
    },
  );

  it("asset com extensão que o formato não produz é recusado", async () => {
    const sha = await sha256Of(bytesOf("binario"));
    await expect(readArchive(await withExtra(assetPath(sha, ".exe"), bytesOf("binario")))).rejects.toThrow(
      CorruptArchiveError,
    );
  });

  it("asset acima do teto é recusado, mesmo com o tamanho declarado mentindo (zip bomb)", async () => {
    const zeros = new Uint8Array(2 * 1024 * 1024);
    const sha = await sha256Of(zeros);
    const path = assetPath(sha, ".bin");
    const honest = await write({ assets: [{ sha256: sha, extension: ".bin", bytes: zeros }] });
    const lying = lieAboutSize(honest, path, 10);
    const limits = { ...DEFAULT_ARCHIVE_LIMITS, maxAssetBytes: 1024 * 1024 };

    await expect(readArchive(honest, limits)).rejects.toThrow(ArchiveTooLargeError);
    await expect(readArchive(lying, limits)).rejects.toThrow(ArchiveTooLargeError);
  });

  it("o total descompactado tem teto", async () => {
    const one = new Uint8Array(600 * 1024).fill(1);
    const two = new Uint8Array(600 * 1024).fill(2);
    const archive = await write({
      assets: [
        { sha256: await sha256Of(one), extension: ".bin", bytes: one },
        { sha256: await sha256Of(two), extension: ".bin", bytes: two },
      ],
    });

    await expect(readArchive(archive, { ...DEFAULT_ARCHIVE_LIMITS, maxTotalBytes: 1024 * 1024 })).rejects.toThrow(
      ArchiveTooLargeError,
    );
  });

  it("a quantidade de entradas tem teto", async () => {
    const assets = await Promise.all(
      [1, 2, 3].map(async (n) => ({ sha256: await sha256Of(bytesOf(`a${n}`)), extension: ".txt", bytes: bytesOf(`a${n}`) })),
    );

    await expect(readArchive(await write({ assets }), { ...DEFAULT_ARCHIVE_LIMITS, maxEntries: 4 })).rejects.toThrow(
      ArchiveTooLargeError,
    );
  });

  it("os tetos padrão são os de um acervo real, com folga", () => {
    expect(DEFAULT_ARCHIVE_LIMITS.maxAssetBytes).toBe(64 * 1024 * 1024);
    // O mesmo teto do corpo da rota de import (SEC-03): um número só, nos dois lados.
    expect(DEFAULT_ARCHIVE_LIMITS.maxTotalBytes).toBe(MAX_ARCHIVE_BYTES);
    expect(MAX_ARCHIVE_BYTES).toBe(1024 * 1024 * 1024);
  });
});

/**
 * O `.lbb` que o app exporta, o app importa (SEC-03, G3 da revisão de código).
 *
 * A rota cortava o corpo em 512 MB e o leitor aceitava 2 GB: o backup de uma biblioteca com os PDFs
 * passava de um e não do outro, e o arquivo baixado não voltava. Agora a exportação confere os
 * mesmos tetos que a leitura e recusa antes de gerar um arquivo que não volta.
 */
describe("a exportação respeita os tetos da importação (SEC-03)", () => {
  const asset = async (fill: number, size: number) => {
    const bytes = new Uint8Array(size).fill(fill);
    return { sha256: await sha256Of(bytes), extension: ".bin", bytes };
  };

  it("acima do total, recusa com a mensagem do que fazer", async () => {
    const assets = [await asset(1, 600 * 1024), await asset(2, 600 * 1024)];
    const limits = { ...DEFAULT_ARCHIVE_LIMITS, maxTotalBytes: 1024 * 1024 };

    const refused = write({ assets }, limits);

    await expect(refused).rejects.toThrow(ExportTooLargeError);
    await expect(refused).rejects.toThrow(/1 MB/);
  });

  it("um asset acima do teto da leitura também recusa", async () => {
    const limits = { ...DEFAULT_ARCHIVE_LIMITS, maxAssetBytes: 1024 * 1024 };

    await expect(write({ assets: [await asset(3, 2 * 1024 * 1024)] }, limits)).rejects.toThrow(
      ExportTooLargeError,
    );
  });

  it("a mesma figura em vários lugares conta uma vez, como entra no zip", async () => {
    const one = await asset(4, 600 * 1024);
    const limits = { ...DEFAULT_ARCHIVE_LIMITS, maxTotalBytes: 1024 * 1024 };

    const archive = await write({ assets: [one, one, one] }, limits);

    await expect(readArchive(archive, limits)).resolves.toBeDefined();
  });
});

/** O `data.json` e o manifesto são conferidos contra o schema da v3, e não aceitos por cast. */
describe("o dado tem schema (#270)", () => {
  const withData = async (data: string, manifestOver: Record<string, unknown> = {}) => {
    const files = unzipSync(await write());
    const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"] as Uint8Array));
    const bytes = bytesOf(data);
    files["data.json"] = bytes;
    files["manifest.json"] = bytesOf(
      JSON.stringify({ ...manifest, dataChecksum: await sha256Of(bytes), ...manifestOver }),
    );
    return zipSync(files);
  };

  it("`data.json` que não é JSON vira arquivo corrompido, e não um erro de sintaxe", async () => {
    await expect(readArchive(await withData("{não é json"))).rejects.toThrow(CorruptArchiveError);
  });

  it("tipo errado no dado é recusado com o caminho do campo", async () => {
    const wrong = { ...workspace(), publications: [{ ...workspace().publications[0], title: 42 }] };
    const refusal = readArchive(await withData(JSON.stringify(wrong)));

    await expect(refusal).rejects.toThrow(CorruptArchiveError);
    await expect(refusal).rejects.toThrow(/publications\.0\.title/);
  });

  it("campo que falta é recusado — a v3 não completa nada por conta própria", async () => {
    const { assessments: _assessments, ...missing } = workspace();
    void _assessments;

    await expect(readArchive(await withData(JSON.stringify(missing)))).rejects.toThrow(/assessments/);
  });

  it("manifesto sem os campos do formato é recusado", async () => {
    await expect(readArchive(await withData(JSON.stringify(workspace()), { counts: "muitos" }))).rejects.toThrow(
      CorruptArchiveError,
    );
  });
});

describe("a v3: só ela abre (#268, #269)", () => {
  /** Um `.lbb` íntegro que declara outra versão — o checksum confere, só a versão é antiga. */
  const declaring = async (formatVersion: number) => {
    const files = unzipSync(await write());
    const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"] as Uint8Array));
    files["manifest.json"] = bytesOf(JSON.stringify({ ...manifest, formatVersion }));
    return zipSync(files);
  };

  it.each([1, 2])(
    "um .lbb v%i é recusado com mensagem que diz o que fazer — sem migrador",
    async (version) => {
      const refusal = readArchive(await declaring(version));

      await expect(refusal).rejects.toThrow(RetiredFormatVersionError);
      await expect(refusal).rejects.toThrow(`.lbb v${version}`);
      await expect(refusal).rejects.toThrow(/exporte a biblioteca de novo/);
    },
  );

  it("o round-trip de um .lbb v3 com figuras descritas, capa, recorte e lixeira dá identidade", async () => {
    const pdf = bytesOf("%PDF-1.4 fonte");
    const cover = bytesOf("jpeg da capa");
    const figure = bytesOf("webp da figura");
    const [pdfSha, coverSha, figureSha] = (await Promise.all([pdf, cover, figure].map(sha256Of))) as [
      string,
      string,
      string,
    ];
    const base = workspace();
    const first = base.publications[0]!;
    const describedAs = (sha256: string, kind: string, mimeType: string, originalFilename: string) => ({
      sha256,
      kind,
      mimeType,
      originalFilename,
      width: null,
      height: null,
      metadataJson: null,
    });
    const full: PortableWorkspace = {
      ...base,
      publications: [
        {
          ...first,
          assets: [
            describedAs(coverSha, "COVER", "image/jpeg", "capa.jpg"),
            describedAs(pdfSha, "SOURCE_PDF", "application/pdf", "fonte.pdf"),
          ],
          coverAsset: coverSha,
          sourcePdfAsset: pdfSha,
          nodes: first.nodes.map((node, index) => ({
            ...node,
            bodyLatex: index === 0 ? "Juros simples incidem só sobre o capital." : "",
            deletedAt: index === 1 ? "2026-09-01T12:00:00.000Z" : null,
            anchors:
              index === 0
                ? [
                    {
                      asset: pdfSha,
                      cropAsset: figureSha,
                      pageNumber: 3,
                      box: { x: 0.1, y: 0.2, width: 0.8, height: 0.3 },
                      rotation: null,
                      role: "ILLUSTRATION",
                      sourceText: "Juros Simples",
                      extractionMethod: "scan:book-v1@1",
                      extractionModel: null,
                      metadataJson: null,
                    },
                  ]
                : [],
            question:
              node.question === null
                ? null
                : {
                    ...node.question,
                    assets: [describedAs(figureSha, "QUESTION_IMAGE", "image/webp", "grafico.webp")],
                  },
          })),
        },
      ],
    };

    const bytes = await writeArchive({
      workspace: full,
      assets: [
        { sha256: pdfSha, extension: ".pdf", bytes: pdf },
        { sha256: coverSha, extension: ".jpg", bytes: cover },
        { sha256: figureSha, extension: ".webp", bytes: figure },
      ],
      appVersion: "1.0",
      exportedAt: "2026-10-28T00:00:00Z",
    });
    const read = await readArchive(bytes);

    expect(read.manifest.formatVersion).toBe(3);
    expect(read.workspace).toEqual(full);
    expect(read.assets.map((asset) => asset.sha256).sort()).toEqual([pdfSha, coverSha, figureSha].sort());
  });
});


import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
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
  tags: [{ name: "juros simples", kind: "TOPIC" }],
  publications: [
    {
      ref: "pub-1",
      title: "Juros e Descontos",
      subtitle: null,
      publisher: "Cesgranrio",
      legacyId: 7,
      legacyUuid: "b3f1-…",
      metadataJson: '{"series":"concursos"}',
      coverAsset: null,
      nodes: [
        {
          ref: "node-1",
          parentRef: null,
          kind: "CHAPTER",
          title: "Juros Simples",
          sortKey: "a0",
          numberingStyle: "ROMAN",
          originalLabel: "I",
          legacyId: 100,
          question: null,
        },
        {
          ref: "node-2",
          parentRef: "node-1",
          kind: "QUESTION",
          title: null,
          sortKey: "a1",
          numberingStyle: "ARABIC",
          originalLabel: "1",
          legacyId: 101,
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
                isCorrect: false,
                weight: null,
                legacyId: 1,
              },
              {
                ref: "o-2",
                sortKey: "a1",
                statementLatex: "\\SI{1060}{\\real}",
                solutionLatex: "",
                isCorrect: true,
                weight: null,
                legacyId: 2,
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

const write = (over: Partial<Parameters<typeof writeArchive>[0]> = {}) =>
  writeArchive({
    workspace: workspace(),
    assets: [],
    appVersion: "0.0.0-test",
    exportedAt: "2026-08-10T00:00:00.000Z",
    ...over,
  });

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
    expect(() => assertKnownVersion(2)).toThrow(UnknownFormatVersionError);
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

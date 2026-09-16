import { describe, expect, it } from "vitest";

import { registerUploadedAsset } from "@modules/assets/application/register-uploaded-asset";
import type { StoredAssetRecord } from "@modules/assets/application/store-asset";
import type { AssetWriter, NewAsset, WrittenAsset } from "@modules/assets/domain/book-source";

/**
 * **Um PDF subido para um livro sem fonte torna-se a fonte dele.**
 *
 * O defeito que estes testes fixam era mudo: a ingestão subia o PDF, a tela o mostrava, dava para
 * recortar — e o `Asset` nascia com `publicationId` nulo, o `Publication.sourcePdfAssetId`
 * continuava nulo, e o resumo do livro seguia pedindo “Anexar” o arquivo que já estava lá. Nada
 * falhava; o upload simplesmente não chegava ao livro.
 *
 * O fake abaixo é o `AssetWriter` inteiro, incluindo **a condição** — a escrita da fonte só vale
 * com `sourcePdfAssetId` ainda nulo. Ela não é detalhe do Prisma: é o contrato da porta, e é o que
 * responde tanto “não sobrescreve fonte existente” quanto “dois uploads juntos não deixam um
 * órfão”. Um fake que aceitasse sempre passaria nos dois casos e mentiria nos dois.
 */

interface LivroFake {
  sourcePdfAssetId: string | null;
}

class FakeAssetWriter implements AssetWriter {
  readonly gravados: NewAsset[] = [];
  private proximo = 0;

  constructor(readonly livros: Map<string, LivroFake> = new Map()) {}

  async write(asset: NewAsset, asBookSourceOf: string | null): Promise<WrittenAsset> {
    this.proximo += 1;
    const id = `asset-${this.proximo}`;
    this.gravados.push(asset);

    if (asBookSourceOf === null) return { id, becameBookSource: false };

    const livro = this.livros.get(asBookSourceOf);
    // O equivalente do `updateMany({ where: { sourcePdfAssetId: null } })`: quem chega depois não
    // escreve, e o asset dele continua gravado e pertencendo ao livro.
    if (livro === undefined || livro.sourcePdfAssetId !== null) {
      return { id, becameBookSource: false };
    }

    livro.sourcePdfAssetId = id;
    return { id, becameBookSource: true };
  }
}

const record = (over: Partial<StoredAssetRecord> = {}): StoredAssetRecord => ({
  storageKey: "ws-1/ab/abcdef.pdf",
  sha256: "abcdef",
  sizeBytes: 1024,
  mimeType: "application/pdf",
  originalFilename: "curso.pdf",
  kind: "SOURCE_PDF",
  width: null,
  height: null,
  ...over,
});

const livraria = (sourcePdfAssetId: string | null = null) =>
  new Map<string, LivroFake>([["pub-1", { sourcePdfAssetId }]]);

describe("PDF num livro sem fonte", () => {
  it("nasce ligado ao livro **e** vira o PDF fonte dele", async () => {
    const livros = livraria();
    const assets = new FakeAssetWriter(livros);

    const written = await registerUploadedAsset(
      { assets },
      { record: record(), workspaceId: "ws-1", publicationId: "pub-1", questionId: null },
    );

    expect(written.becameBookSource).toBe(true);
    // As duas metades do defeito, e as duas precisam ser verdade: o asset sabe de que livro é, e o
    // livro sabe qual é a sua fonte. Uma sem a outra é o estado quebrado que havia no banco.
    expect(assets.gravados[0]?.publicationId).toBe("pub-1");
    expect(livros.get("pub-1")?.sourcePdfAssetId).toBe(written.id);
  });
});

describe("PDF num livro que já tem fonte", () => {
  it("não sobrescreve — a fonte é patrimônio, e trocá-la não é efeito colateral de upload (D29)", async () => {
    const livros = livraria("asset-antigo");
    const assets = new FakeAssetWriter(livros);

    const written = await registerUploadedAsset(
      { assets },
      { record: record(), workspaceId: "ws-1", publicationId: "pub-1", questionId: null },
    );

    expect(written.becameBookSource).toBe(false);
    expect(livros.get("pub-1")?.sourcePdfAssetId).toBe("asset-antigo");
    // E mesmo assim o arquivo entrou no acervo ligado ao livro: recusar a **troca** não é recusar
    // o upload, senão a pessoa perderia o arquivo que acabou de subir.
    expect(assets.gravados[0]?.publicationId).toBe("pub-1");
  });
});

describe("imagem na ingestão", () => {
  it("**não** vira fonte do livro", async () => {
    // A ingestão aceita imagem (#185), e uma página fotografada não é o arquivo-fonte do livro.
    const livros = livraria();
    const assets = new FakeAssetWriter(livros);

    const written = await registerUploadedAsset(
      { assets },
      {
        record: record({ kind: "SOURCE_IMAGE", mimeType: "image/png", originalFilename: "p3.png" }),
        workspaceId: "ws-1",
        publicationId: "pub-1",
        questionId: null,
      },
    );

    expect(written.becameBookSource).toBe(false);
    expect(livros.get("pub-1")?.sourcePdfAssetId).toBeNull();
    expect(assets.gravados[0]?.publicationId).toBe("pub-1");
  });
});

describe("upload sem livro", () => {
  it("continua como antes: asset criado, nenhum livro tocado", async () => {
    // `/api/assets` é a rota de upload do produto inteiro, e nem todo arquivo nasce dentro de um
    // livro. A regra da fonte não pode transformar isso em erro.
    const livros = livraria();
    const assets = new FakeAssetWriter(livros);

    const written = await registerUploadedAsset(
      { assets },
      { record: record(), workspaceId: "ws-1", publicationId: null, questionId: "q-1" },
    );

    expect(written.becameBookSource).toBe(false);
    expect(assets.gravados[0]?.publicationId).toBeNull();
    expect(assets.gravados[0]?.questionId).toBe("q-1");
    expect(livros.get("pub-1")?.sourcePdfAssetId).toBeNull();
  });
});

describe("dois uploads simultâneos para o mesmo livro sem fonte", () => {
  it("um vira a fonte, o outro fica gravado no livro — nenhum órfão", async () => {
    const livros = livraria();
    const assets = new FakeAssetWriter(livros);

    const command = (filename: string) => ({
      record: record({ originalFilename: filename, storageKey: `ws-1/ab/${filename}` }),
      workspaceId: "ws-1",
      publicationId: "pub-1",
      questionId: null,
    });

    const [a, b] = await Promise.all([
      registerUploadedAsset({ assets }, command("um.pdf")),
      registerUploadedAsset({ assets }, command("dois.pdf")),
    ]);

    expect([a.becameBookSource, b.becameBookSource].filter(Boolean)).toHaveLength(1);

    const vencedor = a.becameBookSource ? a : b;
    expect(livros.get("pub-1")?.sourcePdfAssetId).toBe(vencedor.id);

    // O perdedor não é descartado nem fica sem dono: ele é um asset do livro que não é a fonte.
    expect(assets.gravados).toHaveLength(2);
    expect(assets.gravados.every((asset) => asset.publicationId === "pub-1")).toBe(true);
  });
});

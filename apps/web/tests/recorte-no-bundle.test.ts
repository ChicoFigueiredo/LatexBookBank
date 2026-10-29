import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { multipart, pngFile, seedQuestion, useTempStorage } from "./support/asset-routes";
import { seedBookWithSource } from "./support/scan-seed";
import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * "Inserir como figura" cita o recorte da origem, e o recorte viaja no bundle (#255, ACV-05).
 *
 * O crop nasce sem questão e sem livro: ele é da âncora. O render da questão procurava os assets só
 * por `questionId`, e o `\includegraphics` que a aba Origem acabou de inserir respondia `File not
 * found` — a mensagem que manda procurar defeito no texto.
 */
describe("o recorte da origem no bundle da questão", () => {
  let dispose: () => Promise<void>;
  beforeAll(async () => {
    dispose = (await createTempDatabase()).dispose;
    await useTempStorage();
  });
  afterAll(async () => {
    await dispose();
  });

  async function recortar(input: {
    sourceAssetId: string;
    publicationId: string;
    questionId: string;
    conteudo: string;
  }) {
    const { POST } = await import("../app/api/assets/crop/route");
    const response = await POST(
      multipart("/api/assets/crop", {
        image: pngFile("recorte.png", input.conteudo),
        sourceAssetId: input.sourceAssetId,
        publicationId: input.publicationId,
        questionId: input.questionId,
        pageNumber: "2",
        x: "0.1",
        y: "0.2",
        width: "0.6",
        height: "0.3",
      }),
    );
    expect(response.status).toBe(201);
  }

  /** O nome que o editor insere: o que a aba Origem recebe do servidor. */
  async function nomeNaOrigem(questionId: string): Promise<string> {
    const { PrismaProvenanceReader } =
      await import("@modules/assets/infrastructure/prisma-provenance-reader");
    const provenance = await new PrismaProvenanceReader().findByQuestionId(questionId);
    expect(provenance?.cropLatexName).toBeTruthy();
    return String(provenance?.cropLatexName);
  }

  async function bundle(questionId: string, statement: string): Promise<string[]> {
    const { loadQuestionAssets } =
      await import("@modules/rendering/infrastructure/prisma-question-assets");
    const { LocalFileStorageProvider } =
      await import("@infrastructure/storage/local/local-file-storage-provider");
    const storage = new LocalFileStorageProvider({ rootDir: String(process.env["STORAGE_ROOT"]) });
    const assets = await loadQuestionAssets(questionId, statement, storage);
    return assets.manifest.map((asset) => asset.name);
  }

  it("o recorte inserido como figura vai no bundle da questão", async () => {
    const { publication, asset } = await seedBookWithSource("book-a.pdf", "inserir-figura");
    const questao = await seedQuestion(publication.id);

    await recortar({
      sourceAssetId: asset.id,
      publicationId: publication.id,
      questionId: questao.id,
      conteudo: "o recorte da questão",
    });
    const nome = await nomeNaOrigem(questao.id);

    expect(await bundle(questao.id, `\\includegraphics{${nome}}`)).toEqual([nome]);
  });

  it("o recorte da continuação também vai, depois de a origem mudar de âncora", async () => {
    const { publication, asset } = await seedBookWithSource("book-a.pdf", "continuacao");
    const questao = await seedQuestion(publication.id);

    await recortar({
      sourceAssetId: asset.id,
      publicationId: publication.id,
      questionId: questao.id,
      conteudo: "a primeira parte",
    });
    const primeira = await nomeNaOrigem(questao.id);
    await recortar({
      sourceAssetId: asset.id,
      publicationId: publication.id,
      questionId: questao.id,
      conteudo: "a segunda parte",
    });
    const segunda = await nomeNaOrigem(questao.id);

    const nomes = await bundle(
      questao.id,
      `\\includegraphics{${primeira}}\n\\includegraphics{${segunda}}`,
    );
    expect(nomes.sort()).toEqual([primeira, segunda].sort());
  });

  it("o recorte de outra questão não vai, mesmo citado", async () => {
    const { publication, asset } = await seedBookWithSource("book-a.pdf", "outra-questao");
    const dona = await seedQuestion(publication.id, "a0");
    const outra = await seedQuestion(publication.id, "a1");

    await recortar({
      sourceAssetId: asset.id,
      publicationId: publication.id,
      questionId: dona.id,
      conteudo: "o recorte de uma só",
    });
    const nome = await nomeNaOrigem(dona.id);

    expect(await bundle(outra.id, `\\includegraphics{${nome}}`)).toEqual([]);
  });
});

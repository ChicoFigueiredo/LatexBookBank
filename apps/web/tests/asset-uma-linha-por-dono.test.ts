import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { multipart, pngFile, seedQuestion, useTempStorage } from "./support/asset-routes";
import { seedBookWithSource } from "./support/scan-seed";
import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * O storage deduplica o **arquivo** pelo hash; a linha de `Asset` é de um dono (#254, ACV-06,
 * CAP-13 e CAP-14 da revisão).
 *
 * A linha devolvida para o mesmo conteúdo era a de quem subiu primeiro: outra questão, outro livro
 * ou outro nome. O render procura pela questão ou pelo livro, e pelo nome gravado na linha — e o
 * `\includegraphics` que a tela acabou de inserir não compilava.
 */
describe("o mesmo arquivo, uma linha por dono", () => {
  let dispose: () => Promise<void>;
  beforeAll(async () => {
    dispose = (await createTempDatabase()).dispose;
    await useTempStorage();
  });
  afterAll(async () => {
    await dispose();
  });

  async function upload(fields: Record<string, string | File>) {
    const { POST } = await import("../app/api/assets/route");
    const response = await POST(multipart("/api/assets", fields));
    expect(response.status).toBe(201);
    return (await response.json()) as { id: string; latexName: string };
  }

  async function bundleOf(questionId: string, latexName: string) {
    const { loadQuestionAssets } =
      await import("@modules/rendering/infrastructure/prisma-question-assets");
    const { LocalFileStorageProvider } =
      await import("@infrastructure/storage/local/local-file-storage-provider");
    const storage = new LocalFileStorageProvider({ rootDir: String(process.env["STORAGE_ROOT"]) });
    const assets = await loadQuestionAssets(questionId, `\\includegraphics{${latexName}}`, storage);
    return assets.manifest.map((asset) => asset.name);
  }

  it("a mesma figura enviada para duas questões entra no bundle das duas", async () => {
    const { workspace, publication } = await seedBookWithSource("book-a.pdf", "duas-questoes");
    const q1 = await seedQuestion(publication.id, "a0");
    const q2 = await seedQuestion(publication.id, "a1");

    const primeira = await upload({
      file: pngFile("grafico.png", "o mesmo gráfico"),
      workspaceId: workspace.id,
      publicationId: publication.id,
      questionId: q1.id,
    });
    const segunda = await upload({
      file: pngFile("grafico.png", "o mesmo gráfico"),
      workspaceId: workspace.id,
      publicationId: publication.id,
      questionId: q2.id,
    });

    expect(await bundleOf(q1.id, primeira.latexName)).toEqual([primeira.latexName]);
    expect(await bundleOf(q2.id, segunda.latexName)).toEqual([segunda.latexName]);
  });

  it("a mesma imagem reenviada com outro nome é citada pelo nome novo", async () => {
    const { workspace, publication } = await seedBookWithSource("book-a.pdf", "outro-nome");
    const questao = await seedQuestion(publication.id);
    const fields = {
      workspaceId: workspace.id,
      publicationId: publication.id,
      questionId: questao.id,
    };

    await upload({ ...fields, file: pngFile("grafico.png", "renomeada") });
    const renomeada = await upload({ ...fields, file: pngFile("fig.png", "renomeada") });

    expect(renomeada.latexName.startsWith("fig-")).toBe(true);
    expect(await bundleOf(questao.id, renomeada.latexName)).toEqual([renomeada.latexName]);
  });

  it("o mesmo arquivo reenviado para o mesmo lugar não acumula linhas", async () => {
    const { workspace, publication } = await seedBookWithSource("book-a.pdf", "reenvio");
    const questao = await seedQuestion(publication.id);
    const fields = {
      workspaceId: workspace.id,
      publicationId: publication.id,
      questionId: questao.id,
    };

    const primeira = await upload({ ...fields, file: pngFile("grafico.png", "reenviada") });
    const segunda = await upload({ ...fields, file: pngFile("grafico.png", "reenviada") });

    expect(segunda.id).toBe(primeira.id);
  });

  it("a figura do scan idêntica à de outro livro entra no corpo deste livro", async () => {
    const { PrismaFigureAssets } =
      await import("@modules/scan/infrastructure/prisma-figure-assets");
    const { loadPublicationAssets } =
      await import("@modules/rendering/infrastructure/prisma-question-assets");

    const a = await seedBookWithSource("book-a.pdf", "figura-livro-a");
    const { prisma, storage } = a;
    const livroB = await prisma.publication.create({
      data: { workspaceId: a.workspace.id, title: "O mesmo PDF, outro livro" },
    });

    const conteudo = new TextEncoder().encode("a mesma figura, byte a byte");
    const file = { content: conteudo, mimeType: "image/png", screen: conteudo };
    const figures = new PrismaFigureAssets(storage);
    const save = (publicationId: string) =>
      figures.save({
        workspaceId: a.workspace.id,
        publicationId,
        file,
        label: "Figura 1",
        pageNumber: 3,
      });

    await save(a.publication.id);
    const deB = await save(livroB.id);

    const assets = await loadPublicationAssets(
      livroB.id,
      `\\includegraphics{${deB.latexName}}`,
      storage,
    );
    expect(assets.manifest.map((asset) => asset.name)).toEqual([deB.latexName]);
  });

  it("descartar a cópia de um recorte não tira a imagem do recorte que ficou", async () => {
    const { POST } = await import("../app/api/assets/crop/route");
    const { discardCapture, readCaptureFacts } =
      await import("@modules/recognition/infrastructure/prisma-capture-queue");
    const { GET } = await import("../app/api/assets/[assetId]/content/route");

    const { publication, asset: fonte } = await seedBookWithSource("book-a.pdf", "recorte-duplo");
    // O duplo clique: o mesmo recorte, salvo duas vezes.
    const recortar = async () => {
      const response = await POST(
        multipart("/api/assets/crop", {
          image: pngFile("recorte.png", "o mesmo recorte"),
          sourceAssetId: fonte.id,
          publicationId: publication.id,
          pageNumber: "1",
          x: "0.1",
          y: "0.1",
          width: "0.5",
          height: "0.2",
        }),
      );
      expect(response.status).toBe(201);
      return (await response.json()) as { anchorId: string; cropAssetId: string };
    };
    const fica = await recortar();
    const copia = await recortar();

    expect(await discardCapture(copia.anchorId)).toBe("discarded");

    const fila = await readCaptureFacts(publication.id);
    expect(fila.map((item) => [item.anchorId, item.cropAssetId])).toEqual([
      [fica.anchorId, fica.cropAssetId],
    ]);
    const imagem = await GET(new Request("http://127.0.0.1:28080/"), {
      params: Promise.resolve({ assetId: fica.cropAssetId }),
    });
    expect(imagem.status).toBe(200);
  });
});

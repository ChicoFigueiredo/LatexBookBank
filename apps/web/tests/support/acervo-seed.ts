import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { assetLatexName } from "@modules/assets/domain/asset-latex-name";

/**
 * Uma biblioteca com tudo o que o `.lbb` precisa carregar, semeada num banco e num storage
 * temporários. Chamar **depois** de `createTempDatabase()`.
 *
 * É o acervo de verdade em miniatura: um livro com capa e PDF fonte, um capítulo com corpo que cita
 * uma figura do scan (com a âncora de ilustração apontando para o recorte), uma questão de múltipla
 * escolha com tudo preenchido e duas figuras do legado, uma segunda questão que usa a mesma figura,
 * e uma questão na lixeira.
 */

const bytesOf = (text: string) => new TextEncoder().encode(text);

export async function seedFullLibrary(slug: string) {
  const { prisma } = await import("@infrastructure/database/sqlite/client");
  const { LocalFileStorageProvider } =
    await import("@infrastructure/storage/local/local-file-storage-provider");

  const storage = new LocalFileStorageProvider({
    rootDir: mkdtempSync(path.join(tmpdir(), "lbb-test-storage-")),
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: "Fundamentos",
      slug,
      description: "As apostilas do Chico",
      legacyId: 42,
      legacySourcePath: "/mnt/bak/Fundamentos",
    },
  });

  const put = async (input: {
    content: Uint8Array;
    mimeType: string;
    originalFilename: string;
    kind: string;
    publicationId?: string;
    questionId?: string;
    width?: number;
    height?: number;
  }) => {
    const stored = await storage.put({
      workspaceId: workspace.id,
      content: input.content,
      mimeType: input.mimeType,
      originalFilename: input.originalFilename,
    });
    const asset = await prisma.asset.create({
      data: {
        workspaceId: workspace.id,
        publicationId: input.publicationId ?? null,
        questionId: input.questionId ?? null,
        kind: input.kind,
        storageKey: stored.storageKey,
        mimeType: input.mimeType,
        originalFilename: input.originalFilename,
        sha256: stored.sha256,
        sizeBytes: stored.sizeBytes,
        width: input.width ?? null,
        height: input.height ?? null,
      },
    });
    return { ...asset, latexName: assetLatexName(asset) };
  };

  const publication = await prisma.publication.create({
    data: {
      workspaceId: workspace.id,
      title: "Fundamentos da Matemática Elementar",
      subtitle: "Conjuntos e funções",
      nickname: "FME 1",
      isbn: "978-85-357-0011-4",
      otherIdentifier: "CDD 510",
      publisher: "Atual",
      publicationDate: new Date("2013-03-01T00:00:00.000Z"),
      notes: "exemplar anotado",
      edition: "9ª",
      editionYear: 2013,
      language: "pt-BR",
      series: "FME",
      volume: "1",
      captureProfileId: "book-v1",
      legacyId: 7,
      legacyUuid: "b3f1c0de-0000-4000-8000-000000000007",
      legacyUpdatedAt: new Date("2020-01-02T03:04:05.000Z"),
      metadataJson: '{"flags":3}',
      authors: {
        create: [
          { position: 0, author: { create: { name: `Iezzi, Gelson (${slug})` } } },
          { position: 1, author: { create: { name: `Murakami, Carlos (${slug})` } } },
        ],
      },
    },
  });

  const cover = await put({
    content: bytesOf(`capa jpeg ${slug}`),
    mimeType: "image/jpeg",
    originalFilename: "capa.jpg",
    kind: "COVER",
    publicationId: publication.id,
    width: 600,
    height: 900,
  });
  const source = await put({
    content: bytesOf(`%PDF-1.4 fonte ${slug}`),
    mimeType: "application/pdf",
    originalFilename: "fme1.pdf",
    kind: "SOURCE_PDF",
    publicationId: publication.id,
  });
  await prisma.publication.update({
    where: { id: publication.id },
    data: { coverAssetId: cover.id, sourcePdfAssetId: source.id },
  });

  // A figura do scan: dois `CROP` do livro, o PDF que o LaTeX inclui e o PNG que a tela mostra.
  const figure = await put({
    content: bytesOf(`%PDF-1.4 figura 1.1 ${slug}`),
    mimeType: "application/pdf",
    originalFilename: "figura-1-1.pdf",
    kind: "CROP",
    publicationId: publication.id,
  });
  await put({
    content: bytesOf(`png tela figura 1.1 ${slug}`),
    mimeType: "image/png",
    originalFilename: "figura-1-1-tela.png",
    kind: "CROP",
    publicationId: publication.id,
  });

  const chapterBody = `Um conjunto é uma coleção.\n\\begin{figure}[H]\\includegraphics{${figure.latexName}}\\caption{Figura 1.1}\\end{figure}`;
  const chapter = await prisma.documentNode.create({
    data: {
      publicationId: publication.id,
      kind: "CHAPTER",
      title: "Conjuntos",
      slug: "conjuntos",
      sortKey: "a0",
      numberingStyle: "ROMAN",
      originalLabel: "I",
      legacyId: 100,
      bodyLatex: chapterBody,
    },
  });

  const illustration = await prisma.sourceAnchor.create({
    data: {
      publicationId: publication.id,
      sourceAssetId: source.id,
      pageNumber: 3,
      xNormalized: 0.1,
      yNormalized: 0.2,
      widthNormalized: 0.5,
      heightNormalized: 0.3,
      rotation: 90,
      cropAssetId: figure.id,
      sourceText: "Figura 1.1",
      extractionMethod: "scan:book-v1@1",
      extractionModel: "qwen",
      metadataJson: '{"itemKey":"fig-1"}',
    },
  });
  await prisma.documentNodeAnchor.create({
    data: {
      documentNodeId: chapter.id,
      sourceAnchorId: illustration.id,
      sortOrder: 0,
      role: "ILLUSTRATION",
    },
  });
  await prisma.documentNode.update({
    where: { id: chapter.id },
    data: { sourceAnchorId: illustration.id },
  });

  const tags = await Promise.all(
    [
      { name: "conjuntos", kind: "TOPIC" },
      { name: "vestibular", kind: "SOURCE" },
    ].map((tag) => prisma.tag.create({ data: { workspaceId: workspace.id, ...tag } })),
  );

  // A questão completa: objetiva, com gabarito, pesos, metadados, tags, apelido e duas figuras —
  // uma do legado (`QUESTION_IMAGE`, nome real) e uma `webp`, MIME que a tabela antiga do `.lbb`
  // não conhecia.
  const question = await prisma.question.create({
    data: {
      type: "MULTIPLE_CHOICE",
      nickname: "União de intervalos",
      statementLatex: "",
      solutionLatex: "A \\cup B = [0, 5]",
      complementLatex: "Ver exercício 3.",
      originalLatex: "Uniao de intervalos (texto original)",
      difficulty: 4,
      year: 2014,
      board: "Vunesp",
      institution: "Unesp",
      role: "Aluno",
      roleLevel: "Médio",
      publisher: "Atual",
      videoUrl: "https://example.org/v",
      status: "READY",
      validationStatus: "VALID",
      legacyId: 101,
      options: {
        create: [
          {
            sortKey: "a0",
            statementLatex: "$[0,3]$",
            solutionLatex: "não",
            originalLatex: "[0,3]",
            isCorrect: false,
            weight: 0,
            legacyId: 1,
            legacyMarcacao: "a",
          },
          {
            sortKey: "a1",
            statementLatex: "$[0,5]$",
            solutionLatex: "sim",
            originalLatex: "[0,5]",
            isCorrect: true,
            weight: 1.5,
            legacyId: 2,
            legacyMarcacao: "b",
          },
          {
            sortKey: "a2",
            statementLatex: "$[3,5]$",
            solutionLatex: "",
            originalLatex: null,
            isCorrect: false,
            weight: null,
            legacyId: 3,
            legacyMarcacao: "c",
          },
        ],
      },
      tags: { create: tags.map((tag) => ({ tagId: tag.id })) },
    },
  });
  const legacyFigure = await put({
    content: bytesOf(`png fig3 ${slug}`),
    mimeType: "image/png",
    originalFilename: "fig3.png",
    kind: "QUESTION_IMAGE",
    questionId: question.id,
    width: 320,
    height: 200,
  });
  const photo = await put({
    content: bytesOf(`webp foto ${slug}`),
    mimeType: "image/webp",
    originalFilename: "foto da lousa.webp",
    kind: "SOURCE_IMAGE",
    questionId: question.id,
  });
  const statementLatex = `Sejam $A$ e $B$:\n\\includegraphics{${legacyFigure.latexName}}\n\\includegraphics{${photo.latexName}}`;
  await prisma.question.update({ where: { id: question.id }, data: { statementLatex } });
  await prisma.documentNode.create({
    data: {
      publicationId: publication.id,
      parentId: chapter.id,
      kind: "QUESTION",
      sortKey: "a0",
      numberingStyle: "ARABIC",
      originalLabel: "1",
      legacyId: 101,
      questionId: question.id,
    },
  });

  // A mesma figura numa segunda questão: uma linha de `Asset` por dona, como o legado grava.
  const sibling = await prisma.question.create({
    data: {
      type: "DISCURSIVE",
      statementLatex: `Refaça com a figura: \\includegraphics{${legacyFigure.latexName}}`,
      legacyId: 102,
    },
  });
  await put({
    content: bytesOf(`png fig3 ${slug}`),
    mimeType: "image/png",
    originalFilename: "fig3.png",
    kind: "QUESTION_IMAGE",
    questionId: sibling.id,
    width: 320,
    height: 200,
  });
  await prisma.documentNode.create({
    data: {
      publicationId: publication.id,
      parentId: chapter.id,
      kind: "QUESTION",
      sortKey: "a1",
      numberingStyle: "ARABIC",
      originalLabel: "2",
      legacyId: 102,
      questionId: sibling.id,
    },
  });

  // Uma questão na lixeira: excluída some das telas, não do acervo — e não do backup.
  const trashed = await prisma.question.create({
    data: { type: "DISCURSIVE", statementLatex: "Questão excluída", legacyId: 103 },
  });
  await prisma.documentNode.create({
    data: {
      publicationId: publication.id,
      parentId: chapter.id,
      kind: "QUESTION",
      sortKey: "a2",
      numberingStyle: "ARABIC",
      originalLabel: "3",
      legacyId: 103,
      questionId: trashed.id,
      deletedAt: new Date("2026-09-01T12:00:00.000Z"),
    },
  });

  return {
    prisma,
    storage,
    workspace,
    publication,
    chapter,
    question,
    sibling,
    trashed,
    figures: { chapter: figure.latexName, legacy: legacyFigure.latexName, photo: photo.latexName },
    statementLatex,
    chapterBody,
  };
}

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { PortableWorkspace } from "@modules/portability/domain/portable-schema";
import type { WorkspaceExport } from "@modules/portability/infrastructure/prisma-workspace-source";
import type { StorageProvider } from "@/shared/ports";

import { seedFullLibrary } from "./support/acervo-seed";
import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * O `.lbb` v3 contra o banco, de ponta a ponta: um acervo semeado num SQLite é exportado, o arquivo
 * é importado **noutro** SQLite, com outro storage, e o que volta é exportado de novo e comparado.
 *
 * Dois bancos, e não um: restaurar o backup é exatamente isto — outra máquina, outro storage, e
 * nada do banco de origem por perto. No mesmo banco, uma figura que o import esquecesse de trazer
 * ainda seria achada pela chave do storage de quem exportou.
 */

const withoutSlug = (workspace: PortableWorkspace) => ({ ...workspace, slug: "" });

/** O que toda entidade tem e o arquivo não leva: identidade e carimbo do banco que a gravou. */
const RUNTIME_IDENTITY = {
  id: "uuid de runtime — o arquivo usa `ref`",
  createdAt: "carimbo do banco de origem",
  updatedAt: "carimbo do banco de origem",
} as const;

/**
 * Onde cada modelo mora no `.lbb`, e o que ele deliberadamente deixa para trás.
 *
 * `sample` devolve um objeto do arquivo exportado que representa o modelo; `renamed` diz quando a
 * coluna atravessa com outro nome (os ponteiros viram `sha256` ou `ref`).
 */
const PORTABLE_HOME: Readonly<
  Record<
    string,
    {
      readonly sample: (workspace: PortableWorkspace) => object;
      readonly renamed?: Readonly<Record<string, string>>;
      readonly notCarried: Readonly<Record<string, string>>;
    }
  >
> = {
  Workspace: {
    sample: (w) => w,
    notCarried: RUNTIME_IDENTITY,
  },
  Assessment: {
    sample: (w) => w.assessments[0]!,
    notCarried: { ...RUNTIME_IDENTITY, workspaceId: "o workspace é o próprio arquivo" },
  },
  AssessmentSection: {
    sample: (w) => w.assessments[0]!.sections[0]!,
    notCarried: { id: RUNTIME_IDENTITY.id, assessmentId: "a seção mora dentro da avaliação" },
  },
  AssessmentItem: {
    sample: (w) => w.assessments[0]!.sections[0]!.items[0]!,
    renamed: { questionId: "question", pinnedLastOptionIdsJson: "pinnedLastOptions" },
    notCarried: { id: RUNTIME_IDENTITY.id, sectionId: "o item mora dentro da seção" },
  },
  AssessmentVariant: {
    sample: (w) => w.assessments[0]!.variants[0]!,
    notCarried: { id: RUNTIME_IDENTITY.id, assessmentId: "a variante mora dentro da avaliação" },
  },
  AssessmentVariantQuestion: {
    sample: (w) => w.assessments[0]!.variants[0]!.questions[0]!,
    renamed: { questionId: "question" },
    notCarried: { id: RUNTIME_IDENTITY.id, variantId: "mora dentro da variante" },
  },
  AssessmentVariantOptionMap: {
    sample: (w) =>
      w.assessments[0]!.variants[0]!.questions.find((question) => question.options.length > 0)!
        .options[0]!,
    renamed: { optionId: "option" },
    notCarried: {
      id: RUNTIME_IDENTITY.id,
      variantQuestionId: "mora dentro da questão da variante",
    },
  },
  DocumentTemplate: {
    sample: (w) => w.templates[0]!,
    notCarried: { ...RUNTIME_IDENTITY, workspaceId: "o workspace é o próprio arquivo" },
  },
  Revision: {
    sample: (w) => w.revisions[0]!,
    renamed: { entityId: "entity" },
    notCarried: {
      id: RUNTIME_IDENTITY.id,
      agentRunId: "o turno do agente não atravessa; a revisão vale sem ele (schema)",
    },
  },
  Publication: {
    sample: (w) => w.publications[0]!,
    renamed: { coverAssetId: "coverAsset", sourcePdfAssetId: "sourcePdfAsset" },
    notCarried: {
      ...RUNTIME_IDENTITY,
      workspaceId: "o workspace é o próprio arquivo",
      importedAt: "quando entrou neste banco — o import grava o instante dele",
    },
  },
  DocumentNode: {
    sample: (w) => w.publications[0]!.nodes[0]!,
    renamed: { parentId: "parentRef", questionId: "question" },
    notCarried: {
      ...RUNTIME_IDENTITY,
      publicationId: "o nó mora dentro da publicação no arquivo",
      sourceAnchorId: "derivada: é a primeira das `anchors`",
      createdByScanRunId: "a varredura não atravessa (é proposta, não acervo)",
    },
  },
  Question: {
    sample: (w) =>
      w.publications[0]!.nodes.find((node) => node.question?.type === "MULTIPLE_CHOICE")!.question!,
    notCarried: { ...RUNTIME_IDENTITY, sourceAnchorId: "derivada: é a primeira âncora do nó" },
  },
  QuestionOption: {
    sample: (w) =>
      w.publications[0]!.nodes.find((node) => node.question?.type === "MULTIPLE_CHOICE")!.question!
        .options[0]!,
    notCarried: {
      ...RUNTIME_IDENTITY,
      questionId: "a alternativa mora dentro da questão no arquivo",
    },
  },
  Asset: {
    sample: (w) => w.publications[0]!.assets[0]!,
    notCarried: {
      id: RUNTIME_IDENTITY.id,
      createdAt: RUNTIME_IDENTITY.createdAt,
      workspaceId: "o workspace é o próprio arquivo",
      publicationId: "o dono é onde o asset aparece no arquivo",
      questionId: "o dono é onde o asset aparece no arquivo",
      storageKey: "o storage de destino dá a chave; o endereço no arquivo é o `sha256`",
      sizeBytes: "medido de novo dos bytes no destino",
      renderJobId: "derivado de render não atravessa",
    },
  },
  SourceAnchor: {
    sample: (w) => w.publications[0]!.nodes[0]!.anchors[0]!,
    renamed: {
      sourceAssetId: "asset",
      cropAssetId: "cropAsset",
      xNormalized: "box",
      yNormalized: "box",
      widthNormalized: "box",
      heightNormalized: "box",
    },
    notCarried: {
      id: RUNTIME_IDENTITY.id,
      createdAt: RUNTIME_IDENTITY.createdAt,
      publicationId: "a âncora mora dentro do nó no arquivo",
    },
  },
};

describe("exportar um acervo e restaurá-lo noutro banco", () => {
  let exported: PortableWorkspace;
  let restored: PortableWorkspace;
  let seeded: Awaited<ReturnType<typeof seedFullLibrary>>;
  let archiveBytes: Uint8Array;
  let importedWorkspaceId: string;
  let restoredRuntime: WorkspaceExport | null;
  let storageB: StorageProvider;
  let disposeB: () => Promise<void>;

  beforeAll(async () => {
    // Banco A: o acervo de origem.
    const a = await createTempDatabase();
    seeded = await seedFullLibrary("lbb-v3-origem");
    {
      const { readWorkspaceForExport } =
        await import("@modules/portability/infrastructure/prisma-workspace-source");
      const { toPortable } = await import("@modules/portability/application/export-workspace");
      const { writeArchive } = await import("@modules/portability/domain/portable-archive");
      const source = await readWorkspaceForExport(seeded.workspace.id, seeded.storage);
      expect(source?.missingAssets).toEqual([]);
      exported = toPortable(source!.workspace);
      archiveBytes = await writeArchive({
        workspace: exported,
        assets: source!.assets,
        appVersion: "test",
        exportedAt: "2026-10-28T00:00:00Z",
      });
    }
    await a.dispose();

    // Banco B: a máquina onde o backup é restaurado. Módulos novos, porque o cliente Prisma é lido
    // de `DATABASE_URL` uma vez por carga.
    const b = await createTempDatabase();
    disposeB = b.dispose;
    vi.resetModules();
    const { LocalFileStorageProvider } =
      await import("@infrastructure/storage/local/local-file-storage-provider");
    storageB = new LocalFileStorageProvider({
      rootDir: mkdtempSync(path.join(tmpdir(), "lbb-test-storage-")),
    });
    const { readArchive } = await import("@modules/portability/domain/portable-archive");
    const { toRuntime } = await import("@modules/portability/application/import-workspace");
    const { writeImportedWorkspace } =
      await import("@modules/portability/infrastructure/prisma-workspace-sink");
    const read = await readArchive(archiveBytes);
    const report = await writeImportedWorkspace(toRuntime(read.workspace), read.assets, storageB);
    expect(report.missingAssets).toEqual([]);
    importedWorkspaceId = report.workspaceId;

    const { readWorkspaceForExport } =
      await import("@modules/portability/infrastructure/prisma-workspace-source");
    const { toPortable } = await import("@modules/portability/application/export-workspace");
    restoredRuntime = await readWorkspaceForExport(importedWorkspaceId, storageB);
    expect(restoredRuntime?.missingAssets).toEqual([]);
    restored = toPortable(restoredRuntime!.workspace);
  });

  afterAll(async () => {
    await disposeB?.();
  });

  it("o arquivo é um .lbb v3", async () => {
    const { readArchive } = await import("@modules/portability/domain/portable-archive");
    expect((await readArchive(archiveBytes)).manifest.formatVersion).toBe(3);
  });

  it("exportar de novo o que foi restaurado dá o mesmo arquivo, campo a campo", () => {
    // O slug ganha sufixo no destino (é `@unique`, e importar duas vezes cria duas bibliotecas).
    expect(withoutSlug(restored)).toEqual(withoutSlug(exported));
  });

  it("a questão completa volta com gabarito, pesos, metadados, tags e apelido", () => {
    const question = restored.publications[0]?.nodes.find(
      (node) => node.legacyId === 101,
    )?.question;
    expect(question).toMatchObject({
      type: "MULTIPLE_CHOICE",
      nickname: "União de intervalos",
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
      tags: ["conjuntos", "vestibular"],
    });
    expect(
      question?.options.map((o) => [o.isCorrect, o.weight, o.legacyMarcacao, o.originalLatex]),
    ).toEqual([
      [false, 0, "a", "[0,3]"],
      [true, 1.5, "b", "[0,5]"],
      [false, null, "c", null],
    ]);
  });

  it("as figuras voltam com o nome, o tipo e o MIME de origem — e o LaTeX continua achando cada uma", async () => {
    const { loadQuestionAssets, loadPublicationAssets } =
      await import("@modules/rendering/infrastructure/prisma-question-assets");
    const publication = restoredRuntime!.workspace.publications[0]!;
    const questionNode = publication.nodes.find((node) => node.legacyId === 101)!;
    const siblingNode = publication.nodes.find((node) => node.legacyId === 102)!;
    const chapterNode = publication.nodes.find((node) => node.legacyId === 100)!;

    const own = await loadQuestionAssets(
      questionNode.question!.id,
      questionNode.question!.statementLatex,
      storageB,
    );
    expect(own.manifest.map((asset) => asset.name).sort()).toEqual(
      [seeded.figures.legacy, seeded.figures.photo].sort(),
    );

    // A mesma figura na segunda questão: a dela, e não emprestada da primeira.
    const shared = await loadQuestionAssets(
      siblingNode.question!.id,
      siblingNode.question!.statementLatex,
      storageB,
    );
    expect(shared.manifest.map((asset) => asset.name)).toEqual([seeded.figures.legacy]);

    // A figura do scan, que o corpo do capítulo cita e que pertence ao livro.
    const body = await loadPublicationAssets(publication.id, chapterNode.bodyLatex, storageB);
    expect(body.manifest.map((asset) => asset.name)).toEqual([seeded.figures.chapter]);
  });

  it("a capa, o PDF fonte e o recorte da âncora de ilustração atravessam", () => {
    const publication = restored.publications[0]!;
    const bySha = new Map(publication.assets.map((asset) => [asset.sha256, asset]));
    expect(bySha.get(publication.coverAsset ?? "")).toMatchObject({
      kind: "COVER",
      mimeType: "image/jpeg",
      originalFilename: "capa.jpg",
      width: 600,
      height: 900,
    });
    expect(bySha.get(publication.sourcePdfAsset ?? "")).toMatchObject({
      kind: "SOURCE_PDF",
      originalFilename: "fme1.pdf",
    });

    const [anchor] = publication.nodes.find((node) => node.legacyId === 100)!.anchors;
    expect(anchor).toMatchObject({
      role: "ILLUSTRATION",
      rotation: 90,
      metadataJson: '{"itemKey":"fig-1"}',
    });
    expect(bySha.get(anchor?.cropAsset ?? "")).toMatchObject({
      kind: "CROP",
      originalFilename: "figura-1-1.pdf",
    });
  });

  /**
   * **Toda coluna tem destino**: ou atravessa o `.lbb`, ou está aqui com o motivo de não atravessar.
   *
   * A lista de colunas vem do cliente Prisma gerado, e não de uma cópia à mão: uma coluna nova em
   * `Question` que ninguém pôs no select do export nem no create do import faria o backup perder o
   * campo em silêncio. Aqui ela quebra este teste até alguém decidir.
   */
  it.each(Object.keys(PORTABLE_HOME))("nenhuma coluna de %s some em silêncio", async (model) => {
    const { Prisma } = await import("@/generated/prisma/browser");
    const columns = Object.values(
      (Prisma as unknown as Record<string, Record<string, string>>)[`${model}ScalarFieldEnum`] ??
        {},
    );
    expect(columns.length).toBeGreaterThan(0);

    const home = PORTABLE_HOME[model]!;
    const carried = new Set(Object.keys(home.sample(exported)));
    const lost = columns.filter(
      (column) => !(column in home.notCarried) && !carried.has(home.renamed?.[column] ?? column),
    );
    expect(lost).toEqual([]);
  });

  it("a biblioteca volta com a descrição e a origem legada — e o import legado a reconhece", () => {
    expect(restored).toMatchObject({
      description: "As apostilas do Chico",
      legacyId: 42,
      legacySourcePath: "/mnt/bak/Fundamentos",
    });
  });

  it("a prova impressa volta com o gabarito: cada letra aponta para a mesma alternativa", () => {
    const runtime = restoredRuntime!.workspace;
    const options = new Map(
      runtime.publications
        .flatMap((publication) => publication.nodes)
        .flatMap((node) => node.question?.options ?? [])
        .map((option) => [option.id, option.statementLatex]),
    );
    const statements = new Map(
      runtime.publications
        .flatMap((publication) => publication.nodes)
        .flatMap((node) =>
          node.question ? [[node.question.id, node.question.statementLatex] as const] : [],
        ),
    );

    const [assessment] = runtime.assessments;
    expect(assessment).toMatchObject({
      title: "P1 — Conjuntos",
      subtitle: "1º bimestre",
      notes: "Sem calculadora.",
    });
    expect(
      assessment!.sections.flatMap((section) =>
        section.items.map((item) => [
          statements.get(item.questionId),
          item.points,
          item.pinnedLastOptionIds.map((id) => options.get(id)),
        ]),
      ),
    ).toEqual([
      ["Questão excluída", 1, []],
      [seeded.statementLatex, 2.5, ["$[3,5]$"]],
    ]);

    const [variant] = assessment!.variants;
    expect(variant).toMatchObject({
      label: "A",
      seed: 123,
      shuffleQuestions: true,
      shuffleOptions: false,
      createdAt: "2026-09-20T08:00:00.000Z",
    });
    expect(
      variant!.questions.map((question) => [
        question.position,
        statements.get(question.questionId),
        question.options.map((option) => [option.displayedLabel, options.get(option.optionId)]),
      ]),
    ).toEqual([
      [1, "Questão excluída", []],
      [
        2,
        seeded.statementLatex,
        [
          ["a", "$[0,5]$"],
          ["b", "$[0,3]$"],
          ["c", "$[3,5]$"],
        ],
      ],
    ]);
  });

  it("o histórico volta, e o snapshot aponta para as alternativas do banco novo", () => {
    const runtime = restoredRuntime!.workspace;
    const nodes = runtime.publications.flatMap((publication) => publication.nodes);
    const question = nodes.find((node) => node.legacyId === 101)!.question!;
    const chapter = nodes.find((node) => node.legacyId === 100)!;

    const byEntity = runtime.revisions.map((revision) => [
      revision.entityType,
      revision.entityId,
      revision.origin,
    ]);
    expect(byEntity).toEqual(
      expect.arrayContaining([
        ["QUESTION", question.id, "AGENT"],
        ["DOCUMENT_NODE", chapter.id, "USER"],
      ]),
    );
    expect(runtime.revisions).toHaveLength(2);

    const snapshot = JSON.parse(
      runtime.revisions.find((revision) => revision.entityType === "QUESTION")!.snapshotJson,
    ) as { options: { id: string }[] };
    expect(snapshot.options.map((option) => option.id)).toEqual(
      question.options.map((option) => option.id),
    );
  });

  it("os templates voltam", () => {
    expect(restored.templates).toEqual([
      {
        name: "Prova do aluno",
        audience: "STUDENT",
        preambleLatex: "\\documentclass{article}",
        optionsJson: '{"answerSpaceCm":4,"showPoints":true}',
      },
    ]);
  });

  it("a questão da lixeira volta na lixeira", () => {
    const node = restored.publications[0]?.nodes.find((candidate) => candidate.legacyId === 103);
    expect(node?.deletedAt).toBe("2026-09-01T12:00:00.000Z");
    expect(node?.question?.statementLatex).toBe("Questão excluída");
  });
});

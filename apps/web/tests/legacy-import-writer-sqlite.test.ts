import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { mapLegacyLibrary } from "@modules/legacy-import/application/map-legacy-library";
import type {
  LegacyLibraryContents,
  RawLegacyOptionRow,
  RawLegacyQuestionRow,
} from "@modules/legacy-import/domain/legacy-library-reader";
import { EMPTY_INDEX, toRuntime } from "@modules/portability/application/import-workspace";

// Só tipos: o valor vem por `import()` depois do banco, porque o cliente Prisma lê `DATABASE_URL`
// ao ser importado.
import type { PrismaClient } from "@/generated/prisma/client";
import type { PrismaLegacyImportWriter } from "@modules/legacy-import/infrastructure/prisma-legacy-import-writer";

import { createTempDatabase } from "./support/temp-database";

// Monta um SQLite com as migrações: sozinho leva um ou dois segundos, e com a suíte inteira em
// paralelo passa dos 5 s padrão.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * O writer do import legado contra um SQLite com as migrações reais (TST-05 da revisão de
 * 2026-09-23).
 *
 * O import roda **uma vez** por biblioteca, e o que ele grava não tem segunda chance. Até aqui o
 * mapeamento era testado puro e o writer só no acervo de verdade, pelo script. Este arquivo passa
 * uma biblioteca legada mínima pelo mesmo caminho do `write-legacy-import.ts` — mapear, montar o
 * plano, gravar — e confere o que fica no banco.
 *
 * As linhas legadas entram como `LegacyLibraryContents`, a saída do leitor: o leitor de verdade usa
 * `bun:sqlite`, que não existe no Node onde o Vitest roda.
 */

type Prisma = PrismaClient;
type Writer = PrismaLegacyImportWriter;

let dispose: () => Promise<void>;
let prisma: Prisma;
let writer: Writer;

beforeAll(async () => {
  const db = await createTempDatabase();
  dispose = db.dispose;

  // Depois do banco: o cliente Prisma lê `DATABASE_URL` ao ser importado.
  ({ prisma } = await import("@infrastructure/database/sqlite/client"));
  const { PrismaLegacyImportWriter } =
    await import("@modules/legacy-import/infrastructure/prisma-legacy-import-writer");
  writer = new PrismaLegacyImportWriter(prisma);
});

afterAll(async () => {
  await dispose();
});

const linha = (over: Partial<RawLegacyQuestionRow>): RawLegacyQuestionRow => ({
  IdQuestao: 1,
  IdQuestao_Pai: null,
  TipoQuestao: -10,
  idPublication: 1,
  Apelido: null,
  latexQuestao: null,
  latexResposta: null,
  latexOrigin: null,
  latexComplemento: null,
  Dificuldade: 5,
  Numeracao: 0,
  Numeracao_Original: 0,
  Banca: null,
  ["Instituição"]: null,
  Cargo: null,
  Nivel_Cargo: null,
  Ano: null,
  ...over,
});

const item = (over: Partial<RawLegacyOptionRow>): RawLegacyOptionRow => ({
  IdQuestao_Itens: 1,
  IdQuestao: 2,
  Ordem: 1,
  Marcacao: null,
  Correta: 0,
  latexOrigin: null,
  latexItem: null,
  latexResposta: null,
  ...over,
});

/** Um livro, um capítulo, uma múltipla escolha com três itens e uma discursiva. */
const biblioteca: LegacyLibraryContents = {
  capabilities: {
    generation: "latex_complemento",
    hasComplemento: true,
    hasTagConhecimento: true,
    hasBanca: true,
    hasMigrationsTable: true,
  },
  publications: [
    {
      idPublication: 1,
      PublicationName: "Fundamentos de Matemática Elementar",
      UUID: "ABC-123",
      ISBN: "9788535716801",
      AuthorSort: "Iezzi, Gelson",
      PublicationNick: "FME1",
      PublicationSeries: null,
      Notes: null,
    },
  ],
  questions: [
    linha({ IdQuestao: 1, TipoQuestao: -10, Apelido: "Conjuntos" }),
    linha({
      IdQuestao: 2,
      IdQuestao_Pai: 1,
      TipoQuestao: 2,
      latexQuestao: "Quanto é $2+2$?",
      latexResposta: "É $4$.",
      Banca: "FUVEST",
      Ano: 2019,
      Numeracao_Original: 27,
    }),
    linha({
      IdQuestao: 3,
      IdQuestao_Pai: 1,
      TipoQuestao: 1,
      latexQuestao: "Demonstre.",
      Numeracao_Original: 28,
    }),
  ],
  options: [
    // Fora de ordem de propósito: a ordem vem de `Ordem`, não da ordem das linhas.
    item({ IdQuestao_Itens: 12, Ordem: 2, Marcacao: "b", Correta: 1, latexItem: "4" }),
    item({ IdQuestao_Itens: 11, Ordem: 1, Marcacao: "a", latexItem: "3" }),
    item({ IdQuestao_Itens: 13, Ordem: 3, Marcacao: "c", latexItem: "5" }),
  ],
};

let sequence = 0;

function plano() {
  sequence += 1;
  const mapping = mapLegacyLibrary(biblioteca, {
    workspaceName: `Legado ${sequence}`,
    workspaceSlug: `legado-${sequence}`,
  });
  return toRuntime(mapping.portable, EMPTY_INDEX);
}

describe("o writer do import legado", () => {
  it("grava o livro, a árvore, as questões e as alternativas, com o vínculo ao legado", async () => {
    const legacyId = 9001;
    const report = await writer.write(plano(), {
      legacyId,
      legacySourcePath: "/acervo/legado.knowchico",
    });

    expect(report).toMatchObject({ publications: 1, nodes: 3, questions: 2, options: 3 });

    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: report.workspaceId },
    });
    expect(workspace.legacyId).toBe(legacyId);

    const publication = await prisma.publication.findFirstOrThrow({
      where: { workspaceId: report.workspaceId },
      include: { authors: { include: { author: true } } },
    });
    expect(publication).toMatchObject({
      title: "Fundamentos de Matemática Elementar",
      isbn: "9788535716801",
      legacyId: 1,
      legacyUuid: "abc-123",
    });
    expect(publication.importedAt).not.toBeNull();

    const nos = await prisma.documentNode.findMany({
      where: { publicationId: publication.id },
      include: { question: { include: { options: { orderBy: { sortKey: "asc" } } } } },
    });
    const capitulo = nos.find((n) => n.legacyId === 1);
    const multipla = nos.find((n) => n.legacyId === 2);
    const discursiva = nos.find((n) => n.legacyId === 3);

    expect(capitulo).toMatchObject({ kind: "CHAPTER", title: "Conjuntos", parentId: null });
    // A segunda passada do writer liga o pai: sem ela, as questões cairiam na raiz do livro.
    expect(multipla?.parentId).toBe(capitulo?.id);
    expect(discursiva?.parentId).toBe(capitulo?.id);
    expect(multipla!.sortKey < discursiva!.sortKey).toBe(true);

    expect(multipla?.question).toMatchObject({
      type: "MULTIPLE_CHOICE",
      statementLatex: "Quanto é $2+2$?",
      solutionLatex: "É $4$.",
      board: "FUVEST",
      year: 2019,
      legacyId: 2,
    });
    expect(
      multipla?.question?.options.map((o) => [
        o.statementLatex,
        o.isCorrect,
        o.legacyMarcacao,
        o.legacyId,
      ]),
    ).toEqual([
      ["3", false, "a", 11],
      ["4", true, "b", 12],
      ["5", false, "c", 13],
    ]);
    expect(discursiva?.question).toMatchObject({ type: "DISCURSIVE", legacyId: 3 });
    expect(discursiva?.question?.options).toEqual([]);
  });

  it("a mesma biblioteca não entra duas vezes: o IdBiblio já tem workspace", async () => {
    const legacyId = 9002;
    expect(await writer.findExistingWorkspaceId(legacyId)).toBeNull();

    const report = await writer.write(plano(), { legacyId, legacySourcePath: "/acervo/x" });

    expect(await writer.findExistingWorkspaceId(legacyId)).toBe(report.workspaceId);
    // E o banco recusa a segunda, mesmo que alguém pule a checagem.
    await expect(
      writer.write(plano(), { legacyId, legacySourcePath: "/acervo/x" }),
    ).rejects.toThrow();
  });

  it("uma falha no meio desfaz tudo: nem workspace, nem livro, nem questão", async () => {
    // Uma questão que lista uma figura que a resolução não trouxe para o writer é bug de quem
    // chamou, e o writer para. O que este teste fixa é o **tudo ou nada**: a questão de antes, a
    // publicação e o workspace já tinham sido criados dentro da transação.
    const legacyId = 9003;
    const plan = plano();
    const ultima = plan.workspace.publications[0]!.nodes.filter((n) => n.question !== null).at(-1);
    const comFigura = {
      ...plan,
      workspace: {
        ...plan.workspace,
        publications: plan.workspace.publications.map((publication) => ({
          ...publication,
          nodes: publication.nodes.map((node) =>
            node === ultima && node.question !== null
              ? {
                  ...node,
                  question: {
                    ...node.question,
                    assets: [
                      {
                        sha256: "f".repeat(64),
                        kind: "QUESTION_IMAGE",
                        mimeType: "image/png",
                        originalFilename: "figura.png",
                        width: null,
                        height: null,
                        metadataJson: null,
                      },
                    ],
                  },
                }
              : node,
          ),
        })),
      },
    };
    const antes = {
      workspaces: await prisma.workspace.count(),
      questions: await prisma.question.count(),
    };

    await expect(
      writer.write(comFigura, { legacyId, legacySourcePath: "/acervo/y" }),
    ).rejects.toThrow(/não está na resolução/);

    expect(await writer.findExistingWorkspaceId(legacyId)).toBeNull();
    expect(await prisma.workspace.count()).toBe(antes.workspaces);
    expect(await prisma.question.count()).toBe(antes.questions);
  });
});

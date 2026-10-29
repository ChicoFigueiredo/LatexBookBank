import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import {
  createNode,
  deleteNode,
  restoreNode,
} from "@modules/document-tree/application/mutate-tree";
// Só o tipo: o valor vem por `import()` depois do banco.
import type { readGlobalTrash as ReadGlobalTrash } from "@modules/document-tree/infrastructure/prisma-global-trash";

import { createTempDatabase } from "./support/temp-database";

// Monta um SQLite com as migrações: sozinho leva um ou dois segundos, e com a suíte inteira em
// paralelo passa dos 5 s padrão.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * A lixeira do acervo inteiro (`readGlobalTrash`), lida de um SQLite com as migrações reais
 * (TST-05 da revisão de 2026-09-23).
 *
 * O agrupamento por ato tem teste puro (`trash-grouping`); o que só o banco prova é a leitura que
 * o alimenta: o filtro de excluídos, o `deletedAt` de cada ato (é ele que separa "excluído junto"
 * de "excluído antes"), o livro e a biblioteca de cada linha, e o caminho que vem do pai mesmo
 * quando o pai também está na lixeira. O banco é deste arquivo: a leitura não tem filtro, e um
 * banco dividido misturaria a lixeira de outro teste.
 */

let dispose: () => Promise<void>;
let prisma: PrismaClient;
let deps: Parameters<typeof createNode>[0];
let readGlobalTrash: typeof ReadGlobalTrash;

beforeAll(async () => {
  const db = await createTempDatabase();
  dispose = db.dispose;

  // Depois do banco: o cliente Prisma lê `DATABASE_URL` ao ser importado.
  ({ prisma } = await import("@infrastructure/database/sqlite/client"));
  const { PrismaDocumentTreeRepository } =
    await import("@modules/document-tree/infrastructure/prisma-document-tree-repository");
  ({ readGlobalTrash } = await import("@modules/document-tree/infrastructure/prisma-global-trash"));
  const repository = new PrismaDocumentTreeRepository();
  deps = { reader: repository, writer: repository };
});

afterAll(async () => {
  await dispose();
});

async function livro(biblioteca: string, slug: string, title: string, volume: string | null) {
  const workspace = await prisma.workspace.create({ data: { name: biblioteca, slug } });
  return prisma.publication.create({ data: { workspaceId: workspace.id, title, volume } });
}

async function questao(publicationId: string, parentId: string, label: string, nickname: string) {
  const question = await prisma.question.create({
    data: { type: "DISCURSIVE", statementLatex: `Questão ${label}.`, nickname },
    select: { id: true },
  });
  return prisma.documentNode.create({
    data: {
      publicationId,
      parentId,
      kind: "QUESTION",
      sortKey: `a${label}`,
      originalLabel: label,
      questionId: question.id,
    },
  });
}

describe("a lixeira do acervo inteiro", () => {
  it("uma linha por ato, com livro, biblioteca, caminho e o que levou; o vivo não entra", async () => {
    // Biblioteca A, "FME 1": Capítulo 2 › Exercícios › questões 27 e 28.
    const fme = await livro("Biblioteca A", "biblioteca-a", "FME", "1");
    const cap = await createNode(deps, {
      publicationId: fme.id,
      kind: "CHAPTER",
      title: "Capítulo 2",
      placement: { kind: "lastChild", parentId: null },
    });
    const grupo = await createNode(deps, {
      publicationId: fme.id,
      kind: "QUESTION_GROUP",
      title: "Exercícios",
      placement: { kind: "lastChild", parentId: cap },
    });
    await questao(fme.id, grupo, "27", "Progressão aritmética");
    await questao(fme.id, grupo, "28", "Juros");

    // Biblioteca B, "Livro B": Seção › Sub, e uma Viva que fica.
    const outro = await livro("Biblioteca B", "biblioteca-b", "Livro B", null);
    const secao = await createNode(deps, {
      publicationId: outro.id,
      kind: "SECTION",
      title: "Seção",
      placement: { kind: "lastChild", parentId: null },
    });
    const sub = await createNode(deps, {
      publicationId: outro.id,
      kind: "SUBSECTION",
      title: "Sub",
      placement: { kind: "lastChild", parentId: secao },
    });
    await createNode(deps, {
      publicationId: outro.id,
      kind: "SECTION",
      title: "Viva",
      placement: { kind: "lastChild", parentId: null },
    });

    // Três atos, nesta ordem: o grupo (com as duas questões), a Sub sozinha, e depois a Seção.
    await deleteNode(deps, fme.id, grupo);
    await deleteNode(deps, outro.id, sub);
    await deleteNode(deps, outro.id, secao);

    const lixeira = await readGlobalTrash();

    // O mais recente primeiro.
    expect(
      lixeira.items.map(
        ({ id, publicationId, title, where, libraryName, restoresCount, took, waitsFor }) => ({
          id,
          publicationId,
          title,
          where,
          libraryName,
          restoresCount,
          took,
          waitsFor,
        }),
      ),
    ).toEqual([
      {
        id: secao,
        publicationId: outro.id,
        title: "Seção",
        where: "Livro B",
        libraryName: "Biblioteca B",
        restoresCount: 1,
        took: null,
        waitsFor: null,
      },
      {
        // O pai está na lixeira, e ainda assim é o endereço; e a linha diz que espera por ele.
        id: sub,
        publicationId: outro.id,
        title: "Sub",
        where: "Livro B › Seção",
        libraryName: "Biblioteca B",
        restoresCount: 1,
        took: null,
        waitsFor: "Seção",
      },
      {
        // O volume entra no nome do livro.
        id: grupo,
        publicationId: fme.id,
        title: "Exercícios",
        where: "FME 1 › Capítulo 2",
        libraryName: "Biblioteca A",
        restoresCount: 3,
        took: "levou 2 questões com ele",
        waitsFor: null,
      },
    ]);
    expect(lixeira.items.map((item) => item.deletedAt)).toEqual(
      [...lixeira.items.map((item) => item.deletedAt)].sort((a, b) => b.getTime() - a.getTime()),
    );
    expect(lixeira.footer).toBe("3 itens · 5 objetos");
    expect(lixeira).toMatchObject({ itemCount: 3, objectCount: 5 });

    // Restaurar a Seção solta a Sub: ela continua na lixeira, mas já não espera ninguém.
    await restoreNode(deps, outro.id, secao);

    const depois = await readGlobalTrash();
    expect(depois.items.map((item) => item.id)).toEqual([sub, grupo]);
    expect(depois.items[0]).toMatchObject({ where: "Livro B › Seção", waitsFor: null });
    expect(depois.footer).toBe("2 itens · 4 objetos");
  });

  it("a questão sem título aparece pelo rótulo do livro e pelo apelido", async () => {
    const pub = await livro("Biblioteca C", "biblioteca-c", "Iezzi", "2");
    const cap = await createNode(deps, {
      publicationId: pub.id,
      kind: "CHAPTER",
      title: "Funções",
      placement: { kind: "lastChild", parentId: null },
    });
    const no = await questao(pub.id, cap, "33", "Função afim");

    await deleteNode(deps, pub.id, no.id);

    const item = (await readGlobalTrash()).items.find((linha) => linha.id === no.id);
    expect(item).toMatchObject({
      title: "Questão 33 · Função afim",
      kind: "QUESTION",
      where: "Iezzi 2 › Funções",
      libraryName: "Biblioteca C",
      // Ela é o que foi excluído, não algo que veio junto.
      took: null,
    });
  });
});

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ConcurrencyConflictError } from "@/shared/ports/repository";
import { saveNodeBody } from "@modules/document-tree/application/save-node-body";
import {
  addOption,
  moveOption,
  removeOption,
  setCorrectOption,
} from "@modules/questions/application/mutate-options";
import { saveQuestion } from "@modules/questions/application/save-question";

import { createTempDatabase } from "./support/temp-database";

// Monta um SQLite com as migrações: sozinho leva um ou dois segundos, e com a suíte inteira em
// paralelo passa dos 5 s padrão.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * Salvar questão, mexer nas alternativas e salvar o corpo de um nó, contra os adaptadores Prisma
 * e um SQLite com as migrações reais (TST-05 da revisão de 2026-09-23).
 *
 * `save-question.test.ts` usa um dublê, e o guarda real de concorrência não está no caso de uso:
 * é o `updateMany({ where: { id, updatedAt } })` do adaptador. Um dublê não reproduz o round-trip
 * do `DateTime` pelo libSQL — se a precisão mudasse, toda gravação viraria 409 falso, ou pior,
 * a cláusula deixaria de pegar a corrida e a gravação passaria por cima sem conflito.
 */

type Prisma = (typeof import("@infrastructure/database/sqlite/client"))["prisma"];
type Adapters = {
  questions: import("@modules/questions/infrastructure/prisma-question-repository").PrismaQuestionRepository;
  options: import("@modules/questions/infrastructure/prisma-option-writer").PrismaOptionWriter;
  bodies: import("@modules/document-tree/infrastructure/prisma-node-body").PrismaNodeBodyRepository;
};

let dispose: () => Promise<void>;
let prisma: Prisma;
let adapters: Adapters;

beforeAll(async () => {
  const db = await createTempDatabase();
  dispose = db.dispose;

  // Depois do banco: o cliente Prisma lê `DATABASE_URL` ao ser importado.
  ({ prisma } = await import("@infrastructure/database/sqlite/client"));
  const { PrismaQuestionRepository } =
    await import("@modules/questions/infrastructure/prisma-question-repository");
  const { PrismaOptionWriter } =
    await import("@modules/questions/infrastructure/prisma-option-writer");
  const { PrismaNodeBodyRepository } =
    await import("@modules/document-tree/infrastructure/prisma-node-body");
  adapters = {
    questions: new PrismaQuestionRepository(),
    options: new PrismaOptionWriter(),
    bodies: new PrismaNodeBodyRepository(),
  };
});

afterAll(async () => {
  await dispose();
});

let sequence = 0;

/**
 * A versão de partida fica no passado, e com milissegundos: a primeira gravação do teste sempre
 * produz outro `updatedAt` (duas gravações no mesmo milissegundo seriam a mesma versão), e o
 * round-trip pelo libSQL tem de devolver os milissegundos intactos.
 */
const VERSAO_ANTIGA = new Date("2026-01-02T03:04:05.678Z");

async function novaPublicacao() {
  sequence += 1;
  const workspace = await prisma.workspace.create({
    data: { name: `Escrita ${sequence}`, slug: `escrita-${sequence}` },
  });
  return prisma.publication.create({
    data: { workspaceId: workspace.id, title: `Livro ${sequence}` },
  });
}

async function novaQuestao(type = "MULTIPLE_CHOICE") {
  return prisma.question.create({
    data: {
      type,
      statementLatex: "Quanto é $2+2$?",
      updatedAt: VERSAO_ANTIGA,
      options: {
        create: [
          { sortKey: "a0", statementLatex: "3", isCorrect: true },
          { sortKey: "a1", statementLatex: "4", isCorrect: false },
          { sortKey: "a2", statementLatex: "5", isCorrect: false },
        ],
      },
    },
  });
}

describe("salvar questão: a concorrência otimista do adaptador", () => {
  it("com a versão que leu, grava; e a versão devolvida serve para a gravação seguinte", async () => {
    const question = await novaQuestao();
    const lida = await adapters.questions.findById(question.id);
    expect(lida!.updatedAt.toISOString()).toBe(VERSAO_ANTIGA.toISOString());

    const primeira = await saveQuestion(adapters.questions, {
      questionId: question.id,
      expectedUpdatedAt: lida!.updatedAt,
      edit: { statementLatex: "Quanto é $3+3$?" },
    });
    expect(primeira.written).toBe(true);

    // O `updatedAt` volta do banco e vai de novo na cláusula: se o round-trip perdesse precisão,
    // esta segunda gravação seria um 409 falso.
    const segunda = await saveQuestion(adapters.questions, {
      questionId: question.id,
      expectedUpdatedAt: primeira.snapshot.updatedAt,
      edit: { statementLatex: "Quanto é $4+4$?" },
    });
    expect(segunda.written).toBe(true);

    const gravada = await prisma.question.findUniqueOrThrow({ where: { id: question.id } });
    expect(gravada.statementLatex).toBe("Quanto é $4+4$?");
  });

  it("com uma versão vencida, recusa com conflito e não grava nada", async () => {
    const question = await novaQuestao();
    const lida = await adapters.questions.findById(question.id);
    await saveQuestion(adapters.questions, {
      questionId: question.id,
      expectedUpdatedAt: lida!.updatedAt,
      edit: { statementLatex: "outra aba gravou" },
    });

    await expect(
      saveQuestion(adapters.questions, {
        questionId: question.id,
        expectedUpdatedAt: lida!.updatedAt,
        edit: { statementLatex: "esta aba chegou tarde" },
      }),
    ).rejects.toThrow(ConcurrencyConflictError);

    const gravada = await prisma.question.findUniqueOrThrow({ where: { id: question.id } });
    expect(gravada.statementLatex).toBe("outra aba gravou");
  });

  it("a cláusula do adaptador pega a corrida que o caso de uso não vê", async () => {
    // Entre a leitura do caso de uso e a escrita cabe outra transação. Quem segura é o
    // `updatedAt` no `where`: chamado direto com a versão vencida, o adaptador grava zero linhas.
    const question = await novaQuestao();
    const lida = await adapters.questions.findById(question.id);
    await prisma.question.update({
      where: { id: question.id },
      data: { statementLatex: "a outra transação" },
    });

    const resultado = await adapters.questions.updateIfUnchanged(question.id, lida!.updatedAt, {
      statementLatex: "por cima",
    });

    expect(resultado).toBeNull();
    const gravada = await prisma.question.findUniqueOrThrow({ where: { id: question.id } });
    expect(gravada.statementLatex).toBe("a outra transação");
  });
});

describe("alternativas", () => {
  const ordem = async (questionId: string) =>
    (await adapters.options.listOptions(questionId)).map((o) => [o.statementLatex, o.isCorrect]);

  it("marcar a correta numa questão de uma só desmarca a anterior, na mesma transação", async () => {
    const question = await novaQuestao("MULTIPLE_CHOICE");
    const [, quatro] = await adapters.options.listOptions(question.id);

    await setCorrectOption(adapters.options, question.id, quatro!.id);

    expect(await ordem(question.id)).toEqual([
      ["3", false],
      ["4", true],
      ["5", false],
    ]);
  });

  it("numa questão de várias corretas, marcar uma não desmarca a outra", async () => {
    const question = await novaQuestao("MULTIPLE_CORRECT");
    const [, quatro] = await adapters.options.listOptions(question.id);

    await setCorrectOption(adapters.options, question.id, quatro!.id);

    expect(await ordem(question.id)).toEqual([
      ["3", true],
      ["4", true],
      ["5", false],
    ]);
  });

  it("mover reordena pela chave, e a releitura devolve a ordem nova", async () => {
    const question = await novaQuestao();
    const [tres] = await adapters.options.listOptions(question.id);

    await moveOption(adapters.options, question.id, tres!.id, 2);

    expect((await ordem(question.id)).map(([texto]) => texto)).toEqual(["4", "5", "3"]);
  });

  it("acrescentar entra no fim e desmarcada; remover tira só a da questão certa", async () => {
    const question = await novaQuestao();
    const outra = await novaQuestao();
    const [daOutra] = await adapters.options.listOptions(outra.id);

    const nova = await addOption(adapters.options, question.id, "6");
    expect(nova.isCorrect).toBe(false);
    expect((await ordem(question.id)).at(-1)).toEqual(["6", false]);

    await removeOption(adapters.options, question.id, nova.id);
    expect(await ordem(question.id)).toHaveLength(3);

    // O par questão × alternativa tem de bater: a alternativa de outra questão não sai daqui.
    await adapters.options.deleteOption(question.id, daOutra!.id);
    expect(await ordem(outra.id)).toHaveLength(3);
  });
});

describe("corpo do nó", () => {
  async function secao() {
    const publication = await novaPublicacao();
    const node = await prisma.documentNode.create({
      data: {
        publicationId: publication.id,
        kind: "SECTION",
        title: "Seção",
        sortKey: "a0",
        updatedAt: VERSAO_ANTIGA,
      },
    });
    return { publication, node };
  }

  it("grava o corpo e deixa o estado anterior no histórico, numerado", async () => {
    const { publication, node } = await secao();

    const primeira = await saveNodeBody(adapters.bodies, {
      publicationId: publication.id,
      nodeId: node.id,
      expectedUpdatedAt: node.updatedAt,
      bodyLatex: "Primeiro texto.",
    });
    const segunda = await saveNodeBody(adapters.bodies, {
      publicationId: publication.id,
      nodeId: node.id,
      expectedUpdatedAt: primeira.record.updatedAt,
      bodyLatex: "Segundo texto.",
    });

    expect(segunda.written).toBe(true);
    expect(segunda.record.bodyLatex).toBe("Segundo texto.");

    const historico = await adapters.bodies.listRevisions(node.id);
    expect(historico.map((r) => [r.revisionNumber, r.summary, JSON.parse(r.snapshotJson)])).toEqual(
      [
        [2, "corpo editado", { title: "Seção", bodyLatex: "Primeiro texto." }],
        [1, "corpo criado", { title: "Seção", bodyLatex: "" }],
      ],
    );
  });

  it("autosave sem mudança não grava nem cria revisão", async () => {
    const { publication, node } = await secao();

    const resultado = await saveNodeBody(adapters.bodies, {
      publicationId: publication.id,
      nodeId: node.id,
      expectedUpdatedAt: node.updatedAt,
      bodyLatex: "",
    });

    expect(resultado.written).toBe(false);
    expect(await adapters.bodies.listRevisions(node.id)).toEqual([]);
  });

  it("com a versão vencida, recusa com conflito e o histórico não muda", async () => {
    const { publication, node } = await secao();
    await saveNodeBody(adapters.bodies, {
      publicationId: publication.id,
      nodeId: node.id,
      expectedUpdatedAt: node.updatedAt,
      bodyLatex: "Outra aba.",
    });

    await expect(
      saveNodeBody(adapters.bodies, {
        publicationId: publication.id,
        nodeId: node.id,
        expectedUpdatedAt: node.updatedAt,
        bodyLatex: "Esta aba, atrasada.",
      }),
    ).rejects.toThrow(ConcurrencyConflictError);

    expect((await adapters.bodies.find(publication.id, node.id))?.bodyLatex).toBe("Outra aba.");
    expect(await adapters.bodies.listRevisions(node.id)).toHaveLength(1);
  });

  it("o nó de outra publicação não é achado pelo id", async () => {
    const { node } = await secao();
    const outra = await novaPublicacao();

    expect(await adapters.bodies.find(outra.id, node.id)).toBeNull();
  });
});

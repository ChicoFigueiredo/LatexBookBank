import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { jsonRequest, paramsOf, seedLibrary } from "./support/assessment-seed";
import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * A prova não imprime questão da lixeira, e seed fora de Int32 é recusada (#263 · ACV-10, ACV-15).
 *
 * Só a **lista** de candidatas filtrava a lixeira. Acrescentar pela API (ou numa aba aberta antes
 * da exclusão) devolvia 201, e sortear a variante imprimia a questão excluída — no gabarito e na
 * versão do professor. É o defeito que só aparece na sala.
 *
 * A seed é `Int` no schema (32 bits com sinal), e a rota aceitava qualquer inteiro. O relatório
 * viu 3000000000 estourar no `saveVariant` (500, prova perdida); com o adaptador libSQL o valor
 * até grava, mas o sorteio lê `seed >>> 0`, e -1 e 4294967295 passam a dar a mesma prova. O que
 * vale é a faixa do schema, recusada antes com 400.
 *
 * Tudo pelas rotas, contra um banco de verdade; a exclusão passa pela rota da árvore, que é o
 * caminho do produto.
 */

let dispose: () => Promise<void>;

beforeAll(async () => {
  dispose = (await createTempDatabase()).dispose;
});

afterAll(async () => {
  await dispose();
});

const choice = (statement: string) => ({
  type: "MULTIPLE_CHOICE",
  statement,
  options: [{ text: "um", correct: true }, { text: "dois" }],
});

async function routes() {
  const questions = await import("../app/api/assessments/[assessmentId]/questions/route");
  const variants = await import("../app/api/assessments/[assessmentId]/variants/route");
  const detail = await import("../app/api/assessments/[assessmentId]/route");
  const node = await import("../app/api/publications/[id]/nodes/[nodeId]/route");
  const { createAssessment } =
    await import("@modules/assessments/infrastructure/prisma-assessment-repository");
  return { questions, variants, detail, node, createAssessment };
}

/** Uma prova com duas questões, e a segunda já excluída da árvore. */
async function provaComUmaNaLixeira(slug: string) {
  const library = await seedLibrary(slug);
  const { questions, node, createAssessment } = await routes();

  const viva = await library.question(choice("Questão viva"));
  const excluida = await library.question(choice("Questão excluída"));

  const { id: assessmentId } = await createAssessment({
    workspaceId: library.workspace.id,
    title: "Prova",
    subtitle: null,
    notes: null,
  });

  for (const { questionId } of [viva, excluida]) {
    const added = await questions.POST(
      jsonRequest("POST", { questionId }),
      paramsOf({ assessmentId }),
    );
    expect(added.status).toBe(201);
  }

  const removed = await node.DELETE(
    jsonRequest("DELETE"),
    paramsOf({ id: library.publication.id, nodeId: excluida.nodeId }),
  );
  expect(removed.status).toBe(200);

  return { library, assessmentId, viva, excluida };
}

describe("questão da lixeira", () => {
  it("não entra na prova pela API", async () => {
    const library = await seedLibrary("lixeira-api");
    const { questions, node, createAssessment } = await routes();
    const q = await library.question(choice("Excluída antes de entrar"));
    await node.DELETE(
      jsonRequest("DELETE"),
      paramsOf({ id: library.publication.id, nodeId: q.nodeId }),
    );

    const { id: assessmentId } = await createAssessment({
      workspaceId: library.workspace.id,
      title: "Prova",
      subtitle: null,
      notes: null,
    });

    const response = await questions.POST(
      jsonRequest("POST", { questionId: q.questionId }),
      paramsOf({ assessmentId }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "question_in_trash" });
  });

  it("sortear a variante recusa com 409 e diz quais questões estão na lixeira", async () => {
    const { assessmentId, excluida } = await provaComUmaNaLixeira("lixeira-sorteio");
    const { variants } = await routes();

    const response = await variants.POST(
      jsonRequest("POST", { label: "B", seed: 7 }),
      paramsOf({ assessmentId }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "questions_in_trash",
      questionIds: [excluida.questionId],
    });
  });

  it("a avaliação mostra qual questão está na lixeira", async () => {
    const { assessmentId, viva, excluida } = await provaComUmaNaLixeira("lixeira-tela");
    const { detail } = await routes();

    const response = await detail.GET(jsonRequest("GET"), paramsOf({ assessmentId }));
    const payload = (await response.json()) as {
      items: { questionId: string; inTrash: boolean }[];
    };

    expect(payload.items.map((item) => [item.questionId, item.inTrash])).toEqual([
      [viva.questionId, false],
      [excluida.questionId, true],
    ]);
  });
});

describe("seed da variante", () => {
  async function prova(slug: string) {
    const library = await seedLibrary(slug);
    const { questions, variants, createAssessment } = await routes();
    const q = await library.question(choice("Uma questão"));
    const { id: assessmentId } = await createAssessment({
      workspaceId: library.workspace.id,
      title: "Prova",
      subtitle: null,
      notes: null,
    });
    await questions.POST(
      jsonRequest("POST", { questionId: q.questionId }),
      paramsOf({ assessmentId }),
    );

    return (seed: number) =>
      variants.POST(jsonRequest("POST", { label: "A", seed }), paramsOf({ assessmentId }));
  }

  it("acima de Int32 é 400 com o motivo, e não 500", async () => {
    const sortear = await prova("seed-grande");

    const response = await sortear(3_000_000_000);

    expect(response.status).toBe(400);
    expect(((await response.json()) as { message: string }).message).toMatch(/2147483647/);
  });

  it("negativa é 400 — o sorteio a leria como outra seed", async () => {
    const sortear = await prova("seed-negativa");

    expect((await sortear(-1)).status).toBe(400);
  });

  it("o maior Int32 ainda é aceito, e a seed volta como foi pedida", async () => {
    const sortear = await prova("seed-limite");

    const response = await sortear(2_147_483_647);

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ seed: 2_147_483_647 });
  });
});

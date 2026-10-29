import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { jsonRequest, paramsOf, seedLibrary } from "./support/assessment-seed";
import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * As escritas da avaliação pelas rotas, contra um banco de verdade.
 *
 * A regra de pertença (#177) e a trava das variantes moravam no adaptador Prisma e na rota, sem
 * caso de uso (STM-04, STE-03). Este arquivo é a rede para levá-las à camada de aplicação: o que
 * a rota responde não muda, e um script que apague uma prova passa pela mesma trava.
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
  return {
    list: await import("../app/api/assessments/route"),
    detail: await import("../app/api/assessments/[assessmentId]/route"),
    questions: await import("../app/api/assessments/[assessmentId]/questions/route"),
    variants: await import("../app/api/assessments/[assessmentId]/variants/route"),
  };
}

async function novaProva(workspaceId: string): Promise<string> {
  const { list } = await routes();
  const response = await list.POST(jsonRequest("POST", { workspaceId, title: "  Prova 1  " }));
  expect(response.status).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

const acrescentar = async (assessmentId: string, questionId: string) =>
  (await routes()).questions.POST(jsonRequest("POST", { questionId }), paramsOf({ assessmentId }));

describe("acrescentar e tirar questão", () => {
  it("acrescenta com 201, e o segundo clique é 200 'já estava'", async () => {
    const library = await seedLibrary("rotas-acrescentar");
    const q = await library.question(choice("Uma"));
    const assessmentId = await novaProva(library.workspace.id);

    const primeira = await acrescentar(assessmentId, q.questionId);
    expect(primeira.status).toBe(201);
    expect(await primeira.json()).toEqual({ added: true });

    const segunda = await acrescentar(assessmentId, q.questionId);
    expect(segunda.status).toBe(200);
    expect(await segunda.json()).toEqual({ added: false, reason: "already" });
  });

  it("questão de outra biblioteca é 400, e a prova continua vazia (#177)", async () => {
    const daqui = await seedLibrary("rotas-daqui");
    const dali = await seedLibrary("rotas-dali");
    const estrangeira = await dali.question(choice("Dali"));
    const assessmentId = await novaProva(daqui.workspace.id);

    const response = await acrescentar(assessmentId, estrangeira.questionId);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "question_from_another_workspace" });

    const { detail } = await routes();
    const prova = await (await detail.GET(jsonRequest("GET"), paramsOf({ assessmentId }))).json();
    expect(prova.items).toEqual([]);
  });

  it("tirar é 204, e a questão some da prova", async () => {
    const library = await seedLibrary("rotas-tirar");
    const q = await library.question(choice("Sai"));
    const assessmentId = await novaProva(library.workspace.id);
    await acrescentar(assessmentId, q.questionId);

    const { questions, detail } = await routes();
    const removed = await questions.DELETE(
      new Request(`http://localhost/api?questionId=${q.questionId}`, { method: "DELETE" }),
      paramsOf({ assessmentId }),
    );
    expect(removed.status).toBe(204);

    const prova = await (await detail.GET(jsonRequest("GET"), paramsOf({ assessmentId }))).json();
    expect(prova.items).toEqual([]);
  });
});

describe("apagar a prova", () => {
  const apagar = async (assessmentId: string, confirm = false) =>
    (await routes()).detail.DELETE(
      new Request(`http://localhost/api${confirm ? "?confirmVariants=1" : ""}`, {
        method: "DELETE",
      }),
      paramsOf({ assessmentId }),
    );

  it("sem variante sorteada, apaga direto", async () => {
    const library = await seedLibrary("rotas-apagar");
    const assessmentId = await novaProva(library.workspace.id);

    const response = await apagar(assessmentId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true, variantLabels: [] });
  });

  it("com variante, recusa com 409 e as letras; confirmado, apaga e diz o que se perdeu", async () => {
    const library = await seedLibrary("rotas-variante");
    const q = await library.question(choice("Na prova"));
    const assessmentId = await novaProva(library.workspace.id);
    await acrescentar(assessmentId, q.questionId);

    const { variants, detail } = await routes();
    const sorteio = await variants.POST(
      jsonRequest("POST", { label: "A", seed: 3 }),
      paramsOf({ assessmentId }),
    );
    expect(sorteio.status).toBe(201);

    const recusa = await apagar(assessmentId);
    expect(recusa.status).toBe(409);
    expect(await recusa.json()).toMatchObject({
      error: "variants_would_be_lost",
      variantLabels: ["A"],
    });

    // A recusa não apagou nada.
    expect((await detail.GET(jsonRequest("GET"), paramsOf({ assessmentId }))).status).toBe(200);

    const confirmado = await apagar(assessmentId, true);
    expect(confirmado.status).toBe(200);
    expect(await confirmado.json()).toEqual({ deleted: true, variantLabels: ["A"] });

    expect((await detail.GET(jsonRequest("GET"), paramsOf({ assessmentId }))).status).toBe(404);
  });

  it("prova que não existe é 404", async () => {
    const response = await apagar("nao-existe");

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "not_found" });
  });
});

describe("prova que não existe", () => {
  it("acrescentar nela é 404, e não um 200 'não acrescentei'", async () => {
    // O adaptador devolvia `no_section` quando a prova não existia, e a rota respondia 200.
    const library = await seedLibrary("rotas-sem-prova");
    const q = await library.question(choice("Órfã"));

    const response = await acrescentar("nao-existe", q.questionId);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "not_found" });
  });
});

describe("sortear a variante", () => {
  it("prova vazia não sorteia: 409 cannot_compose", async () => {
    const library = await seedLibrary("rotas-vazia");
    const assessmentId = await novaProva(library.workspace.id);

    const response = await (
      await routes()
    ).variants.POST(jsonRequest("POST", { label: "A", seed: 1 }), paramsOf({ assessmentId }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "cannot_compose" });
  });

  it("prova que não existe é 404", async () => {
    const response = await (
      await routes()
    ).variants.POST(jsonRequest("POST", { label: "A" }), paramsOf({ assessmentId: "nao-existe" }));

    expect(response.status).toBe(404);
  });
});

// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type * as Navigation from "next/navigation";

import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * /avaliacoes trabalha na biblioteca escolhida (#261 · STE-01, STE-14).
 *
 * A tela pegava `listWorkspaces()[0]` — a primeira biblioteca em ordem alfabética — e não tinha
 * seletor: a lista mostrava só as provas dela, e toda prova nova nascia nela. Como `addQuestion`
 * recusa questão de outra biblioteca, montar avaliação para as outras doze era impossível.
 *
 * O teste roda a **página** contra um banco de verdade, com duas bibliotecas: é a página que
 * decidia mal, e um teste da tela com props prontas não teria visto o defeito.
 *
 * O `next/navigation` é dublado porque o `useRouter` só existe dentro do provider que o Next
 * monta em runtime.
 */

const push = vi.fn();
vi.mock("next/navigation", async (importOriginal) => ({
  // O `notFound` é o de verdade: é ele que a página chama para responder 404.
  ...(await importOriginal<typeof Navigation>()),
  useRouter: () => ({ refresh: vi.fn(), push }),
  usePathname: () => "/avaliacoes",
}));

let dispose: () => Promise<void>;
let aritmeticaId: string;
let geometriaId: string;

beforeAll(async () => {
  dispose = (await createTempDatabase()).dispose;

  const { prisma } = await import("@infrastructure/database/sqlite/client");
  const { createAssessment } =
    await import("@modules/assessments/infrastructure/prisma-assessment-repository");

  // "Aritmética" vem antes em ordem alfabética: é a que a tela escolhia sozinha.
  aritmeticaId = (
    await prisma.workspace.create({ data: { name: "Aritmética", slug: "aritmetica" } })
  ).id;
  geometriaId = (await prisma.workspace.create({ data: { name: "Geometria", slug: "geometria" } }))
    .id;
  await prisma.workspace.create({ data: { name: "Vazia", slug: "vazia" } });

  await createAssessment({
    workspaceId: aritmeticaId,
    title: "Prova de Aritmética",
    subtitle: null,
    notes: null,
  });
  await createAssessment({
    workspaceId: geometriaId,
    title: "Prova de Geometria",
    subtitle: null,
    notes: null,
  });
});

afterAll(async () => {
  await dispose();
});

afterEach(() => {
  cleanup();
  push.mockClear();
  vi.unstubAllGlobals();
});

/** A página como o Next a chama: `searchParams` é uma Promise no App Router. */
async function abrir(query: Record<string, string> = {}) {
  const { default: AssessmentsPage } = await import("../app/avaliacoes/page");
  // A barra de infraestrutura do shell pergunta ao servidor ao montar; aqui não há servidor.
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 503 })));
  render(await AssessmentsPage({ searchParams: Promise.resolve(query) }));
}

describe("a biblioteca da tela de avaliações", () => {
  it("lista as provas da biblioteca escolhida, e não as da primeira em ordem alfabética", async () => {
    await abrir({ biblioteca: "geometria" });

    expect(screen.getByRole("link", { name: "Prova de Geometria" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Prova de Aritmética" })).toBeNull();
  });

  it("a prova nova nasce na biblioteca escolhida", async () => {
    const corpos: unknown[] = [];
    await abrir({ biblioteca: "geometria" });
    vi.stubGlobal("fetch", (_url: string, init?: RequestInit) => {
      corpos.push(JSON.parse(String(init?.body ?? "{}")));
      return Promise.resolve(new Response(JSON.stringify({ id: "nova" }), { status: 201 }));
    });

    fireEvent.change(screen.getByLabelText("Nova avaliação"), {
      target: { value: "Lista de triângulos" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));

    await waitFor(() => expect(corpos).toHaveLength(1));
    expect(corpos[0]).toEqual({ workspaceId: geometriaId, title: "Lista de triângulos" });
  });

  it("o seletor mostra todas as bibliotecas e troca de biblioteca pela URL", async () => {
    await abrir({ biblioteca: "geometria" });

    const seletor = screen.getByLabelText("Biblioteca") as HTMLSelectElement;
    expect([...seletor.options].map((option) => option.text)).toEqual([
      "Aritmética",
      "Geometria",
      "Vazia",
    ]);
    expect(seletor.value).toBe("geometria");

    fireEvent.change(seletor, { target: { value: "aritmetica" } });
    expect(push).toHaveBeenCalledWith("/avaliacoes?biblioteca=aritmetica");
  });

  it("biblioteca que não existe é 404, e não a primeira da lista em silêncio", async () => {
    await expect(abrir({ biblioteca: "nao-existe" })).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
  });
});

describe("a tela no design system", () => {
  it("tem cabeçalho de página com o nome da biblioteca", async () => {
    await abrir({ biblioteca: "geometria" });

    expect(screen.getByRole("heading", { level: 1, name: "Avaliações" })).toBeTruthy();
  });

  it("biblioteca sem prova mostra o estado vazio com o gesto de criar", async () => {
    await abrir({ biblioteca: "vazia" });

    expect(
      screen.getByRole("heading", { name: "Nenhuma avaliação nesta biblioteca" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Nova avaliação")).toBeTruthy();
  });
});

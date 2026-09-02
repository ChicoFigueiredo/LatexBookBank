// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CalibreScreen } from "../app/bibliotecas/[slug]/livros/calibre/calibre-screen";

/**
 * A seleção múltipla da tela do Calibre — a ponta visível de `importManyFromCatalog`.
 *
 * O backend do lote fechou primeiro (rota `import-batch`, sequencial, um livro ruim não derruba os
 * outros) e a tela seguiu só sabendo importar de um em um. O que este arquivo protege é o contrato
 * entre os dois: **um** livro marcado segue pela rota antiga (onde mora a conversa de duplicata);
 * **vários** vão juntos para `import-batch`, e o relatório mostra cada um com seu desfecho — o que
 * entrou com link, o que não entrou com a razão, sem misturar os dois em "deu certo".
 */

/**
 * O App Router só existe dentro do provider que o Next monta em runtime — mesmo dublê do
 * delete-assessment.test.tsx, pelo mesmo motivo: o AppShell pede `useRouter` para a paleta, e
 * montar meio framework para testar uma seleção seria menos honesto que dublar o hook.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/bibliotecas/matematica/livros/calibre",
}));

const LIBRARY = { id: "lib1", name: "Matemática", slug: "matematica" };

const entrada = (n: number, extra: Partial<Record<string, unknown>> = {}) => ({
  externalId: `calibre:${n}`,
  title: `Livro ${n}`,
  authors: ["Autora"],
  publisher: null,
  year: 2020,
  isbn: null,
  series: null,
  seriesIndex: null,
  files: [{ format: "PDF", sizeBytes: 1024 * 1024 }],
  hasCover: true,
  duplicate: null,
  ...extra,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

/** `fetch` roteado por URL, guardando o corpo de cada chamada para o teste conferir. */
function stubFetch(rotas: Record<string, { status: number; body: unknown }>) {
  const chamadas: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body?: string }) => {
      chamadas.push({ url, body: init?.body ? JSON.parse(init.body) : null });
      // O shell tem vida própria (barra de infra pede /api/infra); o teste só dubla o que é dele.
      // Ao resto responde 503, que os vizinhos já sabem tratar — a barra fica em "verificando…",
      // que é o estado real de quem não conseguiu perguntar. Um 200 de forma errada derrubaria a
      // árvore inteira por causa de um componente que nem é o testado.
      const rota = rotas[url] ?? { status: 503, body: {} };
      return {
        ok: rota.status < 400,
        status: rota.status,
        json: async () => rota.body,
      };
    }),
  );
  return chamadas;
}

async function abrirCatalogo(livros: unknown[]) {
  fireEvent.change(screen.getByPlaceholderText("/caminho/para/Calibre"), {
    target: { value: "/mnt/u/Calibre" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Abrir catálogo" }));
  await waitFor(() => {
    expect(screen.getByText("Livro 1")).toBeTruthy();
  });
  return livros;
}

const CATALOGO = (livros: unknown[]) => ({
  "/api/catalog": {
    status: 200,
    body: { summary: { bookCount: livros.length, formats: { PDF: livros.length } }, entries: livros },
  },
});

describe("seleção múltipla", () => {
  it("dois livros marcados vão juntos para import-batch, na ordem do clique", async () => {
    const livros = [entrada(1), entrada(2), entrada(3)];
    const chamadas = stubFetch({
      ...CATALOGO(livros),
      "/api/catalog/import-batch": {
        status: 201,
        body: {
          results: [
            {
              externalId: "calibre:2",
              outcome: { kind: "imported", result: { href: "/publications/p2", warnings: [] } },
            },
            {
              externalId: "calibre:1",
              outcome: { kind: "imported", result: { href: "/publications/p1", warnings: [] } },
            },
          ],
        },
      },
    });

    render(<CalibreScreen library={LIBRARY} />);
    await abrirCatalogo(livros);

    // A ordem do clique é a ordem do lote: 2 antes de 1, de propósito.
    fireEvent.click(screen.getByText("Livro 2"));
    fireEvent.click(screen.getByText("Livro 1"));

    fireEvent.click(screen.getByRole("button", { name: "Importar 2 livros" }));

    await waitFor(() => {
      expect(screen.getByText("2 de 2 livros no acervo")).toBeTruthy();
    });

    const lote = chamadas.find((c) => c.url === "/api/catalog/import-batch");
    expect(lote?.body).toMatchObject({
      libraryId: "lib1",
      externalIds: ["calibre:2", "calibre:1"],
    });
  });

  it("o relatório separa o que entrou do que não entrou, com a razão ao lado", async () => {
    const livros = [entrada(1), entrada(2)];
    stubFetch({
      ...CATALOGO(livros),
      "/api/catalog/import-batch": {
        status: 201,
        body: {
          results: [
            {
              externalId: "calibre:1",
              outcome: { kind: "imported", result: { href: "/publications/p1", warnings: [] } },
            },
            {
              externalId: "calibre:2",
              outcome: { kind: "failed", message: "Este livro já está no acervo." },
            },
          ],
        },
      },
    });

    render(<CalibreScreen library={LIBRARY} />);
    await abrirCatalogo(livros);

    fireEvent.click(screen.getByText("Livro 1"));
    fireEvent.click(screen.getByText("Livro 2"));
    fireEvent.click(screen.getByRole("button", { name: "Importar 2 livros" }));

    await waitFor(() => {
      expect(screen.getByText("1 de 2 livros no acervo")).toBeTruthy();
    });
    expect(screen.getByText("importado")).toBeTruthy();
    expect(screen.getByText("não entrou")).toBeTruthy();
    expect(screen.getByText("Este livro já está no acervo.")).toBeTruthy();
  });

  it("um livro só continua indo pela rota antiga — é lá que mora a conversa de duplicata", async () => {
    const livros = [entrada(1)];
    const chamadas = stubFetch({
      ...CATALOGO(livros),
      "/api/catalog/import": {
        status: 201,
        body: { href: "/publications/p1", warnings: [] },
      },
    });

    render(<CalibreScreen library={LIBRARY} />);
    await abrirCatalogo(livros);

    fireEvent.click(screen.getByText("Livro 1"));
    fireEvent.click(screen.getByRole("button", { name: "Importar livro" }));

    await waitFor(() => {
      expect(screen.getByText("Livro no acervo")).toBeTruthy();
    });
    expect(chamadas.some((c) => c.url === "/api/catalog/import")).toBe(true);
    expect(chamadas.some((c) => c.url === "/api/catalog/import-batch")).toBe(false);
  });

  it("marcar de novo desmarca, e Selecionar visíveis pega o que os filtros deixaram", async () => {
    const livros = [entrada(1), entrada(2), entrada(3)];
    stubFetch(CATALOGO(livros));

    render(<CalibreScreen library={LIBRARY} />);
    await abrirCatalogo(livros);

    fireEvent.click(screen.getByText("Livro 1"));
    expect(screen.getByText(/1 na seleção/)).toBeTruthy();
    fireEvent.click(screen.getByText("Livro 1"));
    expect(screen.queryByText(/na seleção/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Selecionar visíveis" }));
    expect(screen.getByText(/3 na seleção/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Limpar seleção" }));
    expect(screen.queryByText(/na seleção/)).toBeNull();
  });
});

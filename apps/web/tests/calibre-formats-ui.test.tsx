// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CalibreScreen } from "../app/bibliotecas/[slug]/livros/calibre/calibre-screen";

/**
 * Escolha de formatos a copiar (P1 do beta-editorial.md, "só o PDF é copiado como fonte").
 *
 * O contrato já aceitava `formats` — `import-from-catalog.ts` só copiava outra coisa se alguém
 * pedisse. Faltava a tela pedir. O que este arquivo protege:
 *
 * - o controle só aparece quando a seleção tem algo além de PDF (mesmo princípio dos filtros de
 *   formato e série, ali em cima: opção única é controle ensinando a ignorar controle);
 * - marcar um formato extra faz `formats` chegar no corpo do pedido, PDF primeiro;
 * - sem tocar em nada, `formats` não viaja — o padrão (só PDF) continua sendo do backend.
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

describe("escolha de formatos a copiar", () => {
  it("sem formato além de PDF na seleção, o controle não aparece", async () => {
    const livros = [entrada(1), entrada(2)];
    stubFetch(CATALOGO(livros));

    render(<CalibreScreen library={LIBRARY} configuredRoot={null} />);
    await abrirCatalogo(livros);

    fireEvent.click(screen.getByText("Livro 1"));

    expect(screen.queryByText(/Formatos a copiar/)).toBeNull();
  });

  it("com EPUB na seleção, o controle aparece com PDF pré-marcado e EPUB desmarcado", async () => {
    const livros = [
      entrada(1, {
        files: [
          { format: "PDF", sizeBytes: 1024 * 1024 },
          { format: "EPUB", sizeBytes: 512 * 1024 },
        ],
      }),
    ];
    stubFetch(CATALOGO(livros));

    render(<CalibreScreen library={LIBRARY} configuredRoot={null} />);
    await abrirCatalogo(livros);

    fireEvent.click(screen.getByText("Livro 1"));

    expect(screen.getByText(/Formatos a copiar/)).toBeTruthy();
    const pdf = screen.getByRole("checkbox", { name: "PDF" }) as HTMLInputElement;
    const epub = screen.getByRole("checkbox", { name: "EPUB" }) as HTMLInputElement;
    expect(pdf.checked).toBe(true);
    expect(epub.checked).toBe(false);
  });

  it("marcar EPUB manda formats: [PDF, EPUB] no corpo do lote", async () => {
    const livros = [
      entrada(1, {
        files: [
          { format: "PDF", sizeBytes: 1024 * 1024 },
          { format: "EPUB", sizeBytes: 512 * 1024 },
        ],
      }),
      entrada(2, {
        files: [
          { format: "PDF", sizeBytes: 1024 * 1024 },
          { format: "EPUB", sizeBytes: 512 * 1024 },
        ],
      }),
    ];
    const chamadas = stubFetch({
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
              outcome: { kind: "imported", result: { href: "/publications/p2", warnings: [] } },
            },
          ],
        },
      },
    });

    render(<CalibreScreen library={LIBRARY} configuredRoot={null} />);
    await abrirCatalogo(livros);

    fireEvent.click(screen.getByText("Livro 1"));
    fireEvent.click(screen.getByText("Livro 2"));
    fireEvent.click(screen.getByRole("checkbox", { name: "EPUB" }));
    fireEvent.click(screen.getByRole("button", { name: "Importar 2 livros" }));

    await waitFor(() => {
      expect(screen.getByText("2 de 2 livros no acervo")).toBeTruthy();
    });

    const lote = chamadas.find((c) => c.url === "/api/catalog/import-batch");
    expect(lote?.body).toMatchObject({ formats: ["PDF", "EPUB"] });
  });

  it("marcar EPUB manda formats: [PDF, EPUB] no corpo do pedido de um livro só", async () => {
    const livros = [
      entrada(1, {
        files: [
          { format: "PDF", sizeBytes: 1024 * 1024 },
          { format: "EPUB", sizeBytes: 512 * 1024 },
        ],
      }),
    ];
    const chamadas = stubFetch({
      ...CATALOGO(livros),
      "/api/catalog/import": {
        status: 201,
        body: { href: "/publications/p1", warnings: [] },
      },
    });

    render(<CalibreScreen library={LIBRARY} configuredRoot={null} />);
    await abrirCatalogo(livros);

    fireEvent.click(screen.getByText("Livro 1"));
    fireEvent.click(screen.getByRole("checkbox", { name: "EPUB" }));
    fireEvent.click(screen.getByRole("button", { name: "Importar livro" }));

    await waitFor(() => {
      expect(screen.getByText("Livro no acervo")).toBeTruthy();
    });

    const pedido = chamadas.find((c) => c.url === "/api/catalog/import");
    expect(pedido?.body).toMatchObject({ formats: ["PDF", "EPUB"] });
  });

  it("sem tocar no controle, formats não viaja no corpo — o padrão continua sendo do backend", async () => {
    const livros = [
      entrada(1, {
        files: [
          { format: "PDF", sizeBytes: 1024 * 1024 },
          { format: "EPUB", sizeBytes: 512 * 1024 },
        ],
      }),
    ];
    const chamadas = stubFetch({
      ...CATALOGO(livros),
      "/api/catalog/import": {
        status: 201,
        body: { href: "/publications/p1", warnings: [] },
      },
    });

    render(<CalibreScreen library={LIBRARY} configuredRoot={null} />);
    await abrirCatalogo(livros);

    fireEvent.click(screen.getByText("Livro 1"));
    fireEvent.click(screen.getByRole("button", { name: "Importar livro" }));

    await waitFor(() => {
      expect(screen.getByText("Livro no acervo")).toBeTruthy();
    });

    const pedido = chamadas.find((c) => c.url === "/api/catalog/import");
    expect(pedido?.body).not.toHaveProperty("formats");
  });
});

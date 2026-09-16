// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CalibreScreen,
  type AttachTarget,
} from "../app/bibliotecas/[slug]/livros/calibre/calibre-screen";

/**
 * A tela do catálogo em modo **"escolher para este livro"** (D44.1).
 *
 * A mesma tela, com um destino: o que muda é o que o botão promete e para onde o pedido vai. O que
 * este arquivo protege é justamente isso — que anexar não vire "importar com outro nome":
 *
 * - o pedido vai para `/api/catalog/attach` com o **livro de destino**, e nunca cria publicação;
 * - a lista do que seria preenchido aparece **antes** de confirmar, e só com campo vazio;
 * - livro que já tem fonte não troca sem a pessoa dizer que sim.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/bibliotecas/analise/livros/calibre",
}));

const LIBRARY = { id: "lib1", name: "Análise Elon", slug: "analise" };

const ALVO: AttachTarget = {
  id: "pub-1",
  title: "Curso de Analise Vol. 1",
  hasSource: false,
  metadata: {
    authors: ["Lima, Elon Lages"],
    publisher: null,
    editionYear: null,
    isbn: null,
    language: null,
    series: null,
    volume: null,
  },
};

const LIVRO_DO_CATALOGO = {
  externalId: "uuid-131",
  title: "Curso de Analise Vol. 1",
  authors: ["Elon Lages Lima"],
  publisher: "IMPA",
  year: 2011,
  isbn: null,
  language: "por",
  series: "Projeto Euclides",
  seriesIndex: "1",
  files: [{ format: "PDF", sizeBytes: 2_818_093 }],
  hasCover: true,
  duplicate: null,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

/** `fetch` roteado por URL, guardando o corpo de cada chamada. Mesmo dublê dos vizinhos. */
function stubFetch(rotas: Record<string, { status: number; body: unknown }>) {
  const chamadas: { url: string; body: Record<string, unknown> | null }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body?: string }) => {
      chamadas.push({
        url,
        body: init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : null,
      });
      const rota = rotas[url] ?? { status: 503, body: {} };
      return { ok: rota.status < 400, status: rota.status, json: async () => rota.body };
    }),
  );
  return chamadas;
}

const CATALOGO = {
  "/api/catalog": {
    status: 200,
    body: { summary: { bookCount: 1, formats: { PDF: 1 } }, entries: [LIVRO_DO_CATALOGO] },
  },
};

async function abrirEEscolher() {
  fireEvent.change(screen.getByPlaceholderText("/caminho/para/Calibre"), {
    target: { value: "/mnt/e/Livros" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Abrir catálogo" }));
  await waitFor(() => {
    expect(screen.getAllByText("Curso de Analise Vol. 1").length).toBeGreaterThan(0);
  });
  fireEvent.click(screen.getAllByText("Curso de Analise Vol. 1").at(-1) as HTMLElement);
}

describe("anexar ao livro de destino", () => {
  it("manda o PDF para o livro que já existe — e nenhuma importação acontece", async () => {
    const chamadas = stubFetch({
      ...CATALOGO,
      "/api/catalog/attach": {
        status: 200,
        body: {
          href: "/publications/pub-1",
          filename: "Curso de Analise Vol. 1 - Elon Lages Lima.pdf",
          replaced: null,
          filled: [{ field: "publisher", label: "Editora", value: "IMPA" }],
          warnings: [],
        },
      },
    });

    render(<CalibreScreen library={LIBRARY} configuredRoot={null} target={ALVO} />);
    await abrirEEscolher();

    fireEvent.click(screen.getByRole("button", { name: "Anexar ao livro" }));

    await waitFor(() => {
      expect(screen.getByText("PDF FONTE ANEXADO")).toBeTruthy();
    });

    const pedido = chamadas.find((c) => c.url === "/api/catalog/attach");
    expect(pedido?.body).toMatchObject({
      publicationId: "pub-1",
      externalId: "uuid-131",
      replace: false,
      fillMetadata: true,
    });
    // A rota que cria livro novo não é chamada — anexar não importa.
    expect(chamadas.some((c) => c.url.includes("/import"))).toBe(false);
  });

  it("mostra o que seria preenchido, e só o que está vazio", async () => {
    stubFetch(CATALOGO);

    render(<CalibreScreen library={LIBRARY} configuredRoot={null} target={ALVO} />);
    await abrirEEscolher();

    // Editora, ano, idioma, série e volume estão vazios no livro — entram na lista.
    expect(screen.getByText("Editora: IMPA")).toBeTruthy();
    expect(screen.getByText("Ano: 2011")).toBeTruthy();
    expect(screen.getByText("Série: Projeto Euclides")).toBeTruthy();
    // Autores o livro já tem: não aparece, e não é sobrescrito.
    expect(screen.queryByText(/^Autores:/)).toBeNull();
  });

  it("não preenche nada quando a pessoa desmarca", async () => {
    const chamadas = stubFetch({
      ...CATALOGO,
      "/api/catalog/attach": {
        status: 200,
        body: { href: "/publications/pub-1", filename: "x.pdf", replaced: null, filled: [] },
      },
    });

    render(<CalibreScreen library={LIBRARY} configuredRoot={null} target={ALVO} />);
    await abrirEEscolher();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Anexar ao livro" }));

    await waitFor(() => {
      expect(chamadas.some((c) => c.url === "/api/catalog/attach")).toBe(true);
    });
    expect(chamadas.at(-1)?.body).toMatchObject({ fillMetadata: false });
  });
});

describe("livro que já tem PDF fonte", () => {
  it("pergunta antes de trocar, e só então manda `replace`", async () => {
    const chamadas = stubFetch({
      ...CATALOGO,
      "/api/catalog/attach": {
        status: 409,
        body: {
          error: "publication_has_source",
          message: "Este livro já tem um PDF fonte.",
          publicationId: "pub-1",
        },
      },
    });

    render(
      <CalibreScreen
        library={LIBRARY}
        configuredRoot={null}
        target={{ ...ALVO, hasSource: true }}
      />,
    );
    await abrirEEscolher();

    fireEvent.click(screen.getByRole("button", { name: "Trocar o PDF fonte deste livro" }));

    await waitFor(() => {
      expect(screen.getByText("Este livro já tem um PDF fonte")).toBeTruthy();
    });
    // A promessa que a D44.5 faz, dita na tela: o anterior não some.
    expect(screen.getByText(/continua no acervo/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Trocar a fonte" }));

    await waitFor(() => {
      expect(chamadas.filter((c) => c.url === "/api/catalog/attach")).toHaveLength(2);
    });
    expect(chamadas.at(-1)?.body).toMatchObject({ replace: true });
  });
});

describe("livro do Calibre sem PDF", () => {
  it("não deixa anexar, e diz o que há lá", async () => {
    stubFetch({
      "/api/catalog": {
        status: 200,
        body: {
          summary: { bookCount: 1, formats: { EPUB: 1 } },
          entries: [{ ...LIVRO_DO_CATALOGO, files: [{ format: "EPUB", sizeBytes: 900_000 }] }],
        },
      },
    });

    render(<CalibreScreen library={LIBRARY} configuredRoot={null} target={ALVO} />);
    await abrirEEscolher();

    expect(screen.getByText(/não tem PDF/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Anexar ao livro" })).toHaveProperty(
      "disabled",
      true,
    );
  });
});

describe("a duplicata do catálogo ganha a terceira saída (D44.7)", () => {
  it("oferece anexar ao livro que já existe, ao lado de abrir e de importar assim mesmo", async () => {
    stubFetch({
      ...CATALOGO,
      "/api/catalog/import": {
        status: 409,
        body: {
          error: "duplicate_publication",
          message: "Já existe um livro com este ISBN no acervo.",
          publicationId: "pub-existente",
        },
      },
    });

    render(<CalibreScreen library={LIBRARY} configuredRoot={null} />);
    await abrirEEscolher();

    fireEvent.click(screen.getByRole("button", { name: "Importar livro" }));

    const anexar = await screen.findByRole("link", { name: "Anexar ao livro que já existe" });
    // O destino leva a tela de volta em modo "escolher para este livro", já com a busca feita.
    expect(anexar.getAttribute("href")).toContain("/livros/calibre?para=pub-existente");
    expect(screen.getByRole("link", { name: "Abrir o que já existe" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Importar assim mesmo" })).toBeTruthy();
  });
});

describe("sem destino, a tela é a de sempre", () => {
  it("continua importando — o modo novo não vaza para quem não pediu", async () => {
    stubFetch(CATALOGO);

    render(<CalibreScreen library={LIBRARY} configuredRoot={null} />);
    await abrirEEscolher();

    expect(screen.getByRole("button", { name: "Importar livro" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Anexar ao livro" })).toBeNull();
  });
});

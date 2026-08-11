// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Diagnostics, SectionStatus } from "@modules/diagnostics/domain/diagnostics";
import { DiagnosticsView } from "@modules/diagnostics/ui/DiagnosticsView";

/**
 * A página responde uma pergunta só: **o que está no ar, e o que não está?**
 *
 * Três estados, não dois. "Não configurado" e "fora do ar" num indicador binário mandam a pessoa
 * procurar em lugares opostos: o primeiro se resolve editando `.env.local`, o segundo subindo um
 * processo.
 */

afterEach(cleanup);

const section = (over: Partial<SectionStatus> = {}): SectionStatus => ({
  health: "ok",
  summary: "tudo certo",
  details: [],
  ...over,
});

const diagnostics = (over: Partial<Diagnostics> = {}): Diagnostics => ({
  app: section({ summary: "LatexBookBank 0.0.0" }),
  database: section({ summary: "SQLite em ./data/latexbookbank.db" }),
  storage: section(),
  renderer: section({ health: "off", summary: "Worker configurado, mas não respondeu" }),
  renderCache: section({ summary: "3 job(s) · 1.2 MB em 6 artefato(s)" }),
  ai: section({ health: "unconfigured", summary: "Nenhum endpoint de IA configurado" }),
  backup: section({ health: "off", summary: "Último backup falhou — 10/08/2026, 06:38" }),
  ...over,
});

const show = (over: Partial<Parameters<typeof DiagnosticsView>[0]> = {}) =>
  render(
    <DiagnosticsView
      diagnostics={diagnostics()}
      workspaces={[{ id: "ws-1", name: "Biblioteca de demonstração" }]}
      {...over}
    />,
  );

describe("os três estados", () => {
  it("distingue **fora do ar** de **não configurado**", () => {
    // Dois "fora do ar" no fixture — renderer e backup. `getAllBy` porque o estado repetido é o
    // caso normal, não a exceção.
    show();

    expect(screen.getAllByText("fora do ar")).toHaveLength(2);
    expect(screen.getAllByText("não configurado")).toHaveLength(1);
  });

  it("o estado vai no texto, não só na cor", () => {
    // Vermelho e cinza são indistinguíveis para quem não distingue as duas cores.
    show();
    expect(screen.getAllByText(/no ar|fora do ar|não configurado/).length).toBeGreaterThan(3);
  });

  it("cada seção mostra o resumo do que está acontecendo", () => {
    show();

    expect(screen.getByText("Worker configurado, mas não respondeu")).toBeTruthy();
    expect(screen.getByText(/Último backup falhou/)).toBeTruthy();
  });

  it("os detalhes aparecem em pares rótulo/valor", () => {
    show({
      diagnostics: diagnostics({
        renderer: section({
          health: "ok",
          summary: "Worker de render no ar",
          details: [
            { label: "Endereço", value: "http://127.0.0.1:28900" },
            { label: "rendererVersion", value: "0.0.0-dev" },
          ],
        }),
      }),
    });

    expect(screen.getByText("rendererVersion")).toBeTruthy();
    expect(screen.getByText("0.0.0-dev")).toBeTruthy();
  });
});

describe("testar conexão", () => {
  it("mostra o resultado, e diz **qual** modelo foi encontrado", async () => {
    // O erro mais comum é endereço certo com modelo inexistente — ele só apareceria na primeira
    // pergunta de verdade se ninguém conferisse aqui.
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ ok: true, message: "Conectado. `qwen3-coder:30b` está disponível." }),
            { headers: { "content-type": "application/json" } },
          ),
        ),
      ),
    );

    show();
    fireEvent.click(screen.getByRole("button", { name: "Testar conexão" }));

    expect(await screen.findByText(/qwen3-coder:30b/)).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("falha aparece como falha, não como silêncio", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("sem rede"))),
    );

    show();
    fireEvent.click(screen.getByRole("button", { name: "Testar conexão" }));

    expect(await screen.findByText(/Não deu para falar com o servidor/)).toBeTruthy();
    vi.unstubAllGlobals();
  });
});

describe("portabilidade", () => {
  it("exportar é um **link** de download, não um botão", () => {
    // Baixar um arquivo é seguir um link; o `router` do Next tentaria renderizar a resposta como
    // página. E o leitor de tela anuncia "link", que é o que acontece.
    show();
    const link = screen.getByRole("link", { name: /Exportar Biblioteca de demonstração/ });

    expect(link.getAttribute("href")).toBe("/api/workspaces/export?workspaceId=ws-1");
    expect(link.hasAttribute("download")).toBe(true);
  });

  it("importar tem campo de arquivo com rótulo próprio", () => {
    show();
    expect(screen.getByLabelText("Arquivo .lbb para importar")).toBeTruthy();
  });

  it("sem workspace, não há o que exportar", () => {
    show({ workspaces: [] });
    expect(screen.queryByRole("link", { name: /Exportar/ })).toBeNull();
  });
});

/**
 * O import pede confirmação **no produto**, não no navegador (#189).
 *
 * A confirmação era um `confirm()` nativo — o único gesto da tela que o navegador pode desligar:
 * marcada a caixa "impedir esta página de criar diálogos", ele devolve `false` sem aparecer, e o
 * import deixaria de acontecer em silêncio, com a tela dizendo "cancelado" sobre algo que ninguém
 * cancelou.
 *
 * A convenção do projeto já era `Modal` sem descarte por clique fora — é a mesma da exclusão na
 * árvore, pelo mesmo motivo: o "não" precisa ser explícito.
 */
describe("importar um `.lbb`", () => {
  const arquivo = () => new File(["conteudo"], "acervo.lbb", { type: "application/zip" });

  /** Primeiro o dry-run, depois (se confirmado) a gravação. */
  const stubImport = () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      urls.push(String(url));
      const dry = String(url).includes("dryRun=1");
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            dry
              ? { wouldCreate: { publications: 2, questions: 7, assets: 3 }, collisions: [] }
              : { report: { questions: 7 } },
          ),
      } as Response);
    });
    return urls;
  };

  const escolher = async (view: ReturnType<typeof show>) => {
    const input = view.container.querySelector('input[type="file"]');
    fireEvent.change(input as HTMLInputElement, { target: { files: [arquivo()] } });
  };

  it("o dry-run acontece **antes** de qualquer gravação, e a tela mostra o que viria", async () => {
    const urls = stubImport();
    const view = show();
    await escolher(view);

    await waitFor(() => expect(screen.getByText(/Importar como um workspace novo/)).toBeTruthy());
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("dryRun=1");
    expect(screen.getByText(/dry-run/)).toBeTruthy();
  });

  it("cancelar **não grava** — e diz isso", async () => {
    const urls = stubImport();
    const view = show();
    await escolher(view);

    await waitFor(() => expect(screen.getByText(/Importar como um workspace novo/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.getByText(/nada foi gravado/i)).toBeTruthy());
    // Continua sendo uma requisição só: a do dry-run.
    expect(urls).toHaveLength(1);
  });

  it("confirmar grava, e só então", async () => {
    const urls = stubImport();
    const view = show();
    await escolher(view);

    await waitFor(() => expect(screen.getByText(/Importar como um workspace novo/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Importar" }));

    await waitFor(() => expect(urls).toHaveLength(2));
    expect(urls[1]).not.toContain("dryRun");
    await waitFor(() => expect(screen.getByText(/Importado: 7/)).toBeTruthy());
  });
});

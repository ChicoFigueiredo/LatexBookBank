// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RenderPanel,
  type RenderOutcomeView,
  type RenderStatus,
} from "@modules/rendering/ui/RenderPanel";

afterEach(cleanup);

const outcome = (over: Partial<RenderOutcomeView> = {}): RenderOutcomeView => ({
  jobId: "job-1",
  state: "DONE",
  success: true,
  cacheHit: false,
  durationMs: 1234,
  diagnostics: [],
  artifacts: [
    {
      name: "main.pdf",
      kind: "RENDER_PDF",
      mimeType: "application/pdf",
      sizeBytes: 30000,
      width: null,
      height: null,
    },
    {
      name: "page-1.png",
      kind: "RENDER_PNG",
      mimeType: "image/png",
      sizeBytes: 12000,
      width: 800,
      height: 1000,
    },
  ],
  stdout: "This is pdfTeX…",
  ...over,
});

const show = (status: RenderStatus) =>
  render(<RenderPanel status={status} onRender={() => {}} sourceLatex="corpo $x$" />);

describe("RenderPanel", () => {
  it("explica o que fazer quando nada foi compilado", () => {
    show({ kind: "idle" });
    expect(screen.getByText(/Ctrl/)).toBeTruthy();
  });

  it("anuncia o atalho no rótulo acessível, não só no título", () => {
    // Quem navega por teclado não passa o mouse para descobrir que o atalho existe.
    show({ kind: "idle" });
    expect(screen.getByRole("button", { name: /Compilar/ }).getAttribute("aria-keyshortcuts")).toBe(
      "Control+Enter",
    );
  });

  it("mostra progresso enquanto compila, e desabilita o botão", () => {
    show({ kind: "running" });

    expect(screen.getByText(/Compilando com o TeX/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Compilar/ })).toHaveProperty("disabled", true);
  });

  it("worker fora do ar é aviso, não erro do documento", () => {
    // Pintar de vermelho mandaria a pessoa procurar defeito no texto dela.
    show({ kind: "unavailable", message: "O worker não respondeu." });

    expect(screen.getByText("Compilação indisponível")).toBeTruthy();
    expect(screen.queryByText("Falha ao compilar")).toBeNull();
  });

  it("mostra o PDF pela rota de artefato, nunca por `storageKey`", () => {
    const { container } = show({ kind: "done", outcome: outcome() });
    const object = container.querySelector("object");

    expect(object?.getAttribute("data")).toBe("/api/render-jobs/job-1/artifacts/main.pdf");
  });

  it("marca o cache hit", () => {
    // Sem isso, um render instantâneo pareceria falha de atualização.
    show({ kind: "done", outcome: outcome({ cacheHit: true }) });
    expect(screen.getByText("cache")).toBeTruthy();
  });

  it("mostra a duração quando compilou de verdade", () => {
    show({ kind: "done", outcome: outcome() });
    expect(screen.getByText("1234 ms")).toBeTruthy();
  });

  it("erro de TeX aparece com a linha, não como stack trace", () => {
    show({
      kind: "done",
      outcome: outcome({
        success: false,
        diagnostics: [
          { severity: "error", message: "Undefined control sequence.", line: 12, file: "main.tex" },
        ],
      }),
    });

    expect(screen.getByText("L12")).toBeTruthy();
    expect(screen.getByText("Undefined control sequence.")).toBeTruthy();
  });

  it("avisos de espaçamento ficam contados, fora da lista", () => {
    // `Overfull \hbox` aparece às dezenas em documento saudável; misturá-lo com erros faria a
    // lista virar ruído, que é o mesmo que não ter lista.
    show({
      kind: "done",
      outcome: outcome({
        diagnostics: [
          { severity: "error", message: "Erro de verdade", line: 3, file: null },
          { severity: "info", message: "Overfull \\hbox", line: 8, file: null },
          { severity: "info", message: "Overfull \\hbox", line: 9, file: null },
        ],
      }),
    });

    expect(screen.getByText(/2 aviso\(s\) de espaçamento/)).toBeTruthy();
    expect(screen.queryByText("Overfull \\hbox")).toBeNull();
  });

  it("a aba Fonte mostra o LaTeX enviado, mesmo sem compilação", () => {
    // É o que responde "o que exatamente foi mandado?" quando o resultado surpreende.
    const view = show({ kind: "idle" });
    // `fireEvent` e não `.click()` cru: o React 19 só aplica o estado dentro de `act`, e um
    // clique direto no nó deixaria a aba sem trocar.
    fireEvent.click(view.getByRole("tab", { name: "Fonte" }));

    expect(screen.getByText(/corpo \$x\$/)).toBeTruthy();
  });

  it("a aba PNG desenha as páginas sobre fundo de papel", () => {
    const view = show({ kind: "done", outcome: outcome() });
    fireEvent.click(view.getByRole("tab", { name: "PNG" }));

    const image = view.container.querySelector("img");
    // O PNG do `pdftocairo` é transparente onde não há tinta; sem fundo, a página sumiria no dark.
    expect(image?.getAttribute("style")).toContain("var(--surface-paper)");
    expect(image?.getAttribute("src")).toBe("/api/render-jobs/job-1/artifacts/page-1.png");
  });

  it("chama `onRender` no clique", () => {
    const onRender = vi.fn();
    render(<RenderPanel status={{ kind: "idle" }} onRender={onRender} sourceLatex="" />);

    fireEvent.click(screen.getByRole("button", { name: /Compilar/ }));
    expect(onRender).toHaveBeenCalledOnce();
  });
});

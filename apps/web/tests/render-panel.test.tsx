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

  it("a aba Log mostra o log cru — ele vem no resultado, não do nada", () => {
    // A aba existia e sempre dizia "sem log": a rota guardava o `stdout` e não o devolvia. Um
    // painel que nunca tem conteúdo passa por decisão de design em vez de defeito.
    const view = show({ kind: "done", outcome: outcome() });
    fireEvent.click(view.getByRole("tab", { name: "Log" }));

    expect(screen.getByText(/This is pdfTeX/)).toBeTruthy();
    expect(screen.queryByText(/Sem log para esta compilação/)).toBeNull();
  });
});

/**
 * Os quatro buracos da #161, e o quinto que apareceu no caminho.
 *
 * Todos são gestos que a interface descrevia sem oferecer: a aba Fonte mostrava um corpo que não
 * era o corpo, o diagnóstico dizia a linha sem levar até ela, e o PDF vivia numa coluna estreita.
 */
describe("RenderPanel — os gestos que faltavam", () => {
  const comDiagnostico = (over: Partial<RenderOutcomeView> = {}) =>
    outcome({
      success: false,
      diagnostics: [
        { severity: "error", message: "Undefined control sequence.", line: 5, file: "main.tex" },
      ],
      // Enunciado de três linhas, depois a lista: a linha 5 do corpo é a alternativa `b`… não —
      // é a primeira alternativa, e o mapa é quem sabe disso.
      sourceMap: [
        { origin: "statementLatex", startLine: 1, lineCount: 3, textStartLine: 1 },
        { origin: "options", startLine: 4, lineCount: 4, textStartLine: 5 },
      ],
      ...over,
    });

  it("a aba Fonte mostra o corpo **do resultado**, não o rascunho da tela", () => {
    // A tela só conhece o enunciado; o corpo compilado leva as alternativas junto. Mostrar um e
    // chamá-lo de outro é o tipo de mentira que só aparece quando alguém compara com o PDF.
    const view = show({
      kind: "done",
      outcome: outcome({ sourceLatex: "enunciado\n\\begin{enumerate}\n\\item a" }),
    });
    fireEvent.click(view.getByRole("tab", { name: "Fonte" }));

    expect(screen.getByText(/begin\{enumerate\}/)).toBeTruthy();
    expect(screen.queryByText(/^corpo \$x\$$/)).toBeNull();
  });

  it("copiar sem área de transferência **diz** o que houve, em vez de não fazer nada", () => {
    // `http://` fora de `localhost` não tem `navigator.clipboard`, e é justamente o caso de quem
    // abre o app pela rede local da escola. O ambiente de teste **tem**, então a ausência precisa
    // ser encenada — senão este caso nunca seria exercitado em lugar nenhum.
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });

    try {
      const view = show({ kind: "idle" });
      fireEvent.click(view.getByRole("tab", { name: "Fonte" }));
      fireEvent.click(screen.getByRole("button", { name: /Copiar LaTeX/ }));

      expect(screen.getByRole("status").textContent).toMatch(/área de transferência/);
    } finally {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it("copiar manda o LaTeX para a área de transferência quando ela existe", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    try {
      const view = show({ kind: "done", outcome: outcome({ sourceLatex: "corpo compilado" }) });
      fireEvent.click(view.getByRole("tab", { name: "Fonte" }));
      fireEvent.click(screen.getByRole("button", { name: /Copiar LaTeX/ }));

      expect(writeText).toHaveBeenCalledWith("corpo compilado");
    } finally {
      // Devolvido no `finally`: um teste que deixa `navigator` alterado contamina os de baixo, e
      // a falha aparece num arquivo que não tem nada a ver com isto.
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it("tela cheia é um estado anunciado, e `Esc` sai dela", () => {
    show({ kind: "done", outcome: outcome() });

    const botao = screen.getByRole("button", { name: "Tela cheia" });
    expect(botao.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(botao);
    expect(screen.getByRole("button", { name: /Sair da tela cheia/ })).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Tela cheia" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("o diagnóstico vira botão e leva ao **campo** certo, não só à linha", () => {
    const onGoTo = vi.fn();
    render(
      <RenderPanel
        status={{ kind: "done", outcome: comDiagnostico() }}
        onRender={() => {}}
        sourceLatex=""
        onGoToDiagnostic={onGoTo}
      />,
    );

    // O rótulo diz o destino: quem ouve a lista precisa saber que o erro é das Alternativas antes
    // de decidir clicar.
    const item = screen.getByRole("button", { name: /Ir para Alternativas/ });
    fireEvent.click(item);

    expect(onGoTo).toHaveBeenCalledWith({ field: "options", line: 1 });
  });

  it("sem mapa, o diagnóstico continua na lista — mas não vira botão", () => {
    // O controle do teste acima: um botão que não leva a lugar nenhum ensina a não clicar nos
    // outros. Acontece de verdade com resultado de uma versão anterior do servidor.
    render(
      <RenderPanel
        status={{
          kind: "done",
          outcome: outcome({
            success: false,
            diagnostics: [
              { severity: "error", message: "Undefined control sequence.", line: 5, file: null },
            ],
          }),
        }}
        onRender={() => {}}
        sourceLatex=""
        onGoToDiagnostic={vi.fn()}
      />,
    );

    expect(screen.getByText("Undefined control sequence.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ir para/ })).toBeNull();
  });

  it("erro sem linha — o do preâmbulo — não vira botão", () => {
    render(
      <RenderPanel
        status={{
          kind: "done",
          outcome: comDiagnostico({
            diagnostics: [
              { severity: "error", message: "Pacote ausente.", line: null, file: null },
            ],
          }),
        }}
        onRender={() => {}}
        sourceLatex=""
        onGoToDiagnostic={vi.fn()}
      />,
    );

    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ir para/ })).toBeNull();
  });
});

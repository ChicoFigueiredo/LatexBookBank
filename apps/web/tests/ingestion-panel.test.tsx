// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A ingestão ponta a ponta, na tela: subir → recortar → reconhecer → revisar.
 *
 * O visualizador é trocado por um botão: `pdf.js` precisa de canvas e de worker, e o que este
 * teste tem a dizer não é sobre rasterização — é sobre **o que a tela manda para cada rota** e
 * sobre a revisão continuar obrigatória. As regras do recorte estão em `crop-interaction.test.ts`.
 */

vi.mock("@modules/assets/ui/PdfCropViewer", () => ({
  PdfCropViewer: ({
    onCrop,
    onEstimar,
    onCropLote,
  }: {
    onCrop: (crop: unknown) => void;
    onEstimar?: (estimadas: unknown) => void;
    onCropLote?: (recortes: unknown) => void;
  }) => (
    <>
      <button
        onClick={() =>
          onCrop({
            pageNumber: 3,
            box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
            png: new Blob([new Uint8Array([1])], { type: "image/png" }),
          })
        }
      >
        recortar
      </button>
      {/* Os dois gestos da estimativa, dublados: o que o teste tem a dizer é sobre o que a tela
          manda para cada rota, e não sobre ler camada de texto — isso é de `pdf-text-layer`. */}
      <button
        onClick={() =>
          onEstimar?.([
            { numero: 1, box: { x: 0.1, y: 0.1, width: 0.8, height: 0.3 }, razao: "enunciado-ate-solucao", continuaNaProxima: false },
            { numero: 2, box: { x: 0.1, y: 0.5, width: 0.8, height: 0.3 }, razao: "enunciado-ate-solucao", continuaNaProxima: false },
          ])
        }
      >
        estimar
      </button>
      <button onClick={() => onEstimar?.([])}>estimar vazio</button>
      <button
        onClick={() =>
          onCropLote?.([
            { numero: 1, pageNumber: 1, box: { x: 0.1, y: 0.1, width: 0.8, height: 0.3 }, png: new Blob([new Uint8Array([1])], { type: "image/png" }) },
            { numero: 2, pageNumber: 1, box: { x: 0.1, y: 0.5, width: 0.8, height: 0.3 }, png: new Blob([new Uint8Array([2])], { type: "image/png" }) },
          ])
        }
      >
        recortar lote
      </button>
    </>
  ),
}));

const { IngestionPanel } = await import("@modules/recognition/ui/IngestionPanel");

afterEach(cleanup);

const pdf = () => new File([new Uint8Array([1])], "prova.pdf", { type: "application/pdf" });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let calls: Array<{ url: string; form: FormData }>;

const stubFetch = (responder: (url: string) => Response = () => json({})) => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, form: init?.body as FormData });
      return responder(url);
    }),
  );
};

const responses = (over: Record<string, Response> = {}): ((url: string) => Response) => {
  const table: Record<string, () => Response> = {
    "/api/assets": () => json({ id: "asset-1" }, 201),
    "/api/assets/crop": () => json({ anchorId: "a1", cropAssetId: "crop-1" }, 201),
    "/api/recognition": () =>
      json({
        cropAssetId: "crop-1",
        result: {
          latex: "x^2 + 1",
          confidence: 0.9,
          alternatives: [],
          providerId: "ollama",
          model: "gemma3:12b",
          durationMs: 120,
        },
        editedLatex: null,
        state: "candidate",
      }),
  };

  return (url: string) => over[url] ?? table[url]!();
};

beforeEach(() => {
  // `happy-dom` não tem `createObjectURL`, e o painel usa a URL do arquivo já em memória em vez de
  // buscá-lo de volta do servidor.
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL() {} }),
  );
});

const show = (onAccept = vi.fn()) => {
  render(<IngestionPanel workspaceId="ws-1" publicationId="pub-1" onAccept={onAccept} />);
  return onAccept;
};

const upload = async (container: HTMLElement) => {
  const input = container.querySelector("input[type=file]") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [pdf()] } });
  await waitFor(() => screen.getByText("recortar"));
};

describe("o caminho inteiro", () => {
  it("sobe, recorta e reconhece — três rotas, na ordem", async () => {
    stubFetch(responses());
    show();

    const container = document.body;
    await upload(container);
    fireEvent.click(screen.getByText("recortar"));

    await waitFor(() => screen.getByLabelText("LaTeX reconhecido"));

    expect(calls.map((call) => call.url)).toEqual([
      "/api/assets",
      "/api/assets/crop",
      "/api/recognition",
    ]);
  });

  it("o recorte sobe com a caixa **normalizada** e a página", async () => {
    // D28: a âncora é o dado; a imagem é conveniência. Pixel aqui vazaria o zoom da tela.
    stubFetch(responses());
    show();

    await upload(document.body);
    fireEvent.click(screen.getByText("recortar"));
    await waitFor(() => expect(calls.length).toBe(3));

    const crop = calls[1]!.form;
    expect(crop.get("pageNumber")).toBe("3");
    expect(crop.get("x")).toBe("0.1");
    expect(crop.get("height")).toBe("0.4");
    expect(crop.get("sourceAssetId")).toBe("asset-1");
    expect(crop.get("publicationId")).toBe("pub-1");
  });

  it("o `workspaceId` acompanha o upload — a chave de storage é prefixada por ele", async () => {
    stubFetch(responses());
    show();

    await upload(document.body);

    expect(calls[0]!.form.get("workspaceId")).toBe("ws-1");
  });

  it("o **livro** acompanha o upload — sem ele o PDF não chega a ser a fonte do livro", async () => {
    // O defeito era este campo faltando: o `Asset` nascia sem `publicationId`, o
    // `sourcePdfAssetId` continuava nulo, e o resumo do livro seguia pedindo "Anexar" um arquivo
    // que a pessoa já tinha subido. A regra é do servidor; o que a tela deve é mandar o livro.
    stubFetch(responses());
    show();

    await upload(document.body);

    expect(calls[0]!.form.get("publicationId")).toBe("pub-1");
  });

  it("avisa quem revalida quando o upload virou o PDF fonte do livro", async () => {
    const attached = vi.fn();
    stubFetch(responses({ "/api/assets": json({ id: "asset-1", becameBookSource: true }, 201) }));
    render(
      <IngestionPanel
        workspaceId="ws-1"
        publicationId="pub-1"
        onAccept={vi.fn()}
        onBookSourceAttached={attached}
      />,
    );

    await upload(document.body);

    await waitFor(() => expect(attached).toHaveBeenCalledTimes(1));
  });

  it("um upload que **não** virou fonte não pede revalidação nenhuma", async () => {
    const attached = vi.fn();
    stubFetch(responses());
    render(
      <IngestionPanel
        workspaceId="ws-1"
        publicationId="pub-1"
        onAccept={vi.fn()}
        onBookSourceAttached={attached}
      />,
    );

    await upload(document.body);

    expect(attached).not.toHaveBeenCalled();
  });

  it("o recorte fica **ao lado** do candidato", async () => {
    // É o requisito da Fase 15: sem a imagem à vista, a revisão que se pede é impossível.
    stubFetch(responses());
    show();

    await upload(document.body);
    fireEvent.click(screen.getByText("recortar"));

    await waitFor(() => screen.getByLabelText("LaTeX reconhecido"));
    expect(screen.getByAltText("Recorte da página")).toBeTruthy();
  });

  it("aceitar só acontece por gesto humano, e entrega o que está na tela", async () => {
    stubFetch(responses());
    const onAccept = show();

    await upload(document.body);
    fireEvent.click(screen.getByText("recortar"));
    await waitFor(() => screen.getByLabelText("LaTeX reconhecido"));

    expect(onAccept).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("LaTeX reconhecido"), {
      target: { value: "x^{2} + 1" },
    });
    fireEvent.click(screen.getByText("Conferi — usar este LaTeX"));

    // O editado, e não o lido: quem corrigiu corrigiu por um motivo. E junto vai a **origem** —
    // sem o `anchorId`, a questão criada a partir deste recorte nasceria sem página nem arquivo,
    // e "de onde veio isto?" ficaria sem resposta seis meses depois.
    expect(onAccept).toHaveBeenCalledWith({
      anchorId: "a1",
      cropAssetId: "crop-1",
      statementLatex: "x^{2} + 1",
      // Vazio, e não ausente: este recorte é uma fórmula no modo `display`, e separar alternativas
      // de uma fórmula seria inventar estrutura. Só o modo `Questão completa` preenche isto, e só
      // depois de mostrar a separação na tela.
      options: [],
      run: {
        providerId: "ollama",
        model: "gemma3:12b",
        durationMs: 120,
        confidence: 0.9,
        mode: "display",
        // O cru do modelo viaja ao lado do corrigido: é o que permite saber, depois, se o erro
        // foi do OCR ou da digitação.
        rawLatex: "x^2 + 1",
      },
    });
  });
});

describe("quando dá errado", () => {
  it("falha do reconhecedor **não perde o recorte** — sobra campo para transcrever à mão", async () => {
    stubFetch(
      responses({
        "/api/recognition": json({ error: "recognition_failed", message: "modelo fora" }, 502),
      }),
    );
    show();

    await upload(document.body);
    fireEvent.click(screen.getByText("recortar"));

    await waitFor(() => screen.getByLabelText("LaTeX reconhecido"));
    expect(screen.getByText("modelo fora")).toBeTruthy();
    expect(screen.getByAltText("Recorte da página")).toBeTruthy();
  });

  it("upload recusado mostra o motivo do servidor e não abre visualizador", async () => {
    stubFetch(
      responses({ "/api/assets": json({ error: "upload_kind", message: "tipo não aceito" }, 415) }),
    );
    show();

    const input = document.body.querySelector("input[type=file]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pdf()] } });

    await waitFor(() => screen.getByText("tipo não aceito"));
    expect(screen.queryByText("recortar")).toBeNull();
  });

  it("aceitar fica bloqueado enquanto o LaTeX está vazio", async () => {
    stubFetch(
      responses({
        "/api/recognition": json({
          cropAssetId: "crop-1",
          result: {
            latex: "   ",
            confidence: null,
            alternatives: [],
            providerId: "ollama",
            model: "gemma3:12b",
            durationMs: 10,
          },
          editedLatex: null,
          state: "candidate",
        }),
      }),
    );
    show();

    await upload(document.body);
    fireEvent.click(screen.getByText("recortar"));
    await waitFor(() => screen.getByLabelText("LaTeX reconhecido"));

    const accept = screen.getByText("Conferi — usar este LaTeX").closest("button");
    expect(accept?.disabled).toBe(true);
  });
});

/**
 * A estimativa e o lote.
 *
 * O que se protege aqui é o que faz o lote ser seguro: ele para em **transcrição guardada**, e
 * nunca cria questão sozinho. Um erro de segmentação viraria trinta questões erradas de uma vez,
 * e é exatamente por isso que a revisão continua sendo de uma em uma.
 */
describe("estimar e recortar em lote", () => {
  it("o lote salva e reconhece cada recorte, em série, e não cria questão nenhuma", async () => {
    stubFetch(responses());
    const onAccept = show();

    await upload(document.body);
    fireEvent.click(screen.getByText("recortar lote"));

    await waitFor(() => screen.getByText("2 de 2 na fila de captura"));

    // Duas questões: salva-reconhece, salva-reconhece — e nesta ordem. Intercalado é o que prova a
    // série: se fossem disparadas juntas, os dois `crop` viriam antes dos dois `recognition`.
    expect(calls.map((call) => call.url)).toEqual([
      "/api/assets",
      "/api/assets/crop",
      "/api/recognition",
      "/api/assets/crop",
      "/api/recognition",
    ]);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("recorte que falha ao transcrever não derruba os outros, e o relatório conta", async () => {
    stubFetch(responses({ "/api/recognition": json({ message: "modelo fora do ar" }, 503) }));
    show();

    await upload(document.body);
    fireEvent.click(screen.getByText("recortar lote"));

    // O recorte das duas está salvo; o que faltou foi a leitura. A fila mostra as duas esperando,
    // que é o estado verdadeiro — e é o caso real de quando o Ollama está fora do ar.
    await waitFor(() => screen.getByText("0 de 2 na fila de captura"));
    expect(calls.filter((call) => call.url === "/api/assets/crop")).toHaveLength(2);
  });

  it("página sem camada de texto diz isso, em vez de fingir que não achou questão", async () => {
    stubFetch(responses());
    show();

    await upload(document.body);
    fireEvent.click(screen.getByText("estimar vazio"));

    expect(screen.getByText("Nenhuma questão reconhecível nesta página")).toBeTruthy();
  });

  it("a estimativa anuncia quantas achou antes de qualquer gravação", async () => {
    stubFetch(responses());
    show();

    await upload(document.body);
    const antes = calls.length;
    fireEvent.click(screen.getByText("estimar"));

    expect(screen.getByText("2 questão(ões) estimada(s) nesta página")).toBeTruthy();
    // Estimar é leitura da página, no cliente: não toca em rota nenhuma.
    expect(calls).toHaveLength(antes);
  });
});

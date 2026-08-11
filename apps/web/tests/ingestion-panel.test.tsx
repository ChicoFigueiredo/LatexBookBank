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
  PdfCropViewer: ({ onCrop }: { onCrop: (crop: unknown) => void }) => (
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

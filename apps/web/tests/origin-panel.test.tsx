// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { originActions, type Provenance } from "@modules/assets/domain/provenance";

/**
 * A aba Origem: de onde a questão veio, e o caminho de volta.
 *
 * O visualizador é trocado por um marcador — `pdf.js` precisa de canvas e worker, e o que
 * interessa aqui é **com que página e com que caixa ele é aberto**. Sem isso, "voltar à origem"
 * abriria o arquivo certo no lugar errado, que é quase o mesmo que não abrir.
 */

let viewerProps: Record<string, unknown> | null = null;

vi.mock("@modules/assets/ui/PdfCropViewer", () => ({
  PdfCropViewer: (props: Record<string, unknown>) => {
    viewerProps = props;
    return <div data-testid="viewer" />;
  },
}));

const { OriginPanel } = await import("@modules/assets/ui/OriginPanel");

afterEach(cleanup);

const provenance = (over: Partial<Provenance> = {}): Provenance => ({
  anchorId: "anchor-1",
  publicationId: "pub-1",
  pageNumber: 7,
  box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  rotation: null,
  source: { assetId: "src-1", filename: "prova.pdf", mimeType: "application/pdf", isPdf: true },
  cropLatexName: "grafico-aabbccdd.png",
  cropAssetId: "crop-1",
  sourceText: null,
  extractionMethod: null,
  extractionModel: null,
  ...over,
});

const serve = (body: unknown, status = 200) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
    ),
  );

const withOrigin = (over: Partial<Provenance> = {}) => {
  const value = provenance(over);
  serve({ provenance: value, actions: originActions(value) });
  return value;
};

describe("a cadeia de proveniência", () => {
  it("diz arquivo, página e pedaço", async () => {
    withOrigin();
    render(<OriginPanel questionId="q1" />);

    await waitFor(() => screen.getByText(/prova\.pdf/));
    expect(screen.getByText(/página 7/)).toBeTruthy();
  });

  it("mostra o recorte pedindo os bytes por `assetId` — nunca por `storageKey`", async () => {
    // D26: a chave é do servidor. Devolvê-la contaria como o storage organiza os arquivos.
    withOrigin();
    render(<OriginPanel questionId="q1" />);

    const crop = (await waitFor(() =>
      screen.getByAltText("Recorte de origem"),
    )) as HTMLImageElement;

    expect(crop.getAttribute("src")).toBe("/api/assets/crop-1/content");
  });

  it("questão digitada à mão não é erro — é uma tela que explica", async () => {
    serve({ provenance: null, actions: [] });
    render(<OriginPanel questionId="q1" />);

    await waitFor(() => screen.getByText("Sem origem registrada"));
  });
});

describe("voltar à origem", () => {
  it("abre a fonte **na página da âncora**, com a caixa destacada", async () => {
    viewerProps = null;
    withOrigin();
    render(<OriginPanel questionId="q1" />);

    fireEvent.click(await waitFor(() => screen.getByText("Abrir na fonte")));

    await waitFor(() => screen.getByTestId("viewer"));
    expect(viewerProps?.["fileUrl"]).toBe("/api/assets/src-1/content");
    expect(viewerProps?.["initialPage"]).toBe(7);
    expect(viewerProps?.["highlight"]).toEqual({
      pageNumber: 7,
      box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    });
  });

  it("o mesmo botão fecha", async () => {
    withOrigin();
    render(<OriginPanel questionId="q1" />);

    fireEvent.click(await waitFor(() => screen.getByText("Abrir na fonte")));
    fireEvent.click(await waitFor(() => screen.getByText("Fechar a fonte")));

    expect(screen.queryByTestId("viewer")).toBeNull();
  });

  it("fonte que não é PDF deixa o botão desabilitado **com o motivo à mão**", async () => {
    withOrigin({
      source: { assetId: "src-2", filename: "foto.png", mimeType: "image/png", isPdf: false },
    });
    render(<OriginPanel questionId="q1" />);

    const button = (await waitFor(() => screen.getByText("Abrir na fonte"))).closest("button")!;

    expect(button.disabled).toBe(true);
    expect(button.getAttribute("title")).toContain("imagem solta");
  });
});

describe("as opções depois do crop", () => {
  it("reconhecer e inserir figura sobem para quem chamou — a aba não decide sozinha", async () => {
    withOrigin();
    const onAction = vi.fn();
    render(<OriginPanel questionId="q1" onAction={onAction} />);

    fireEvent.click(await waitFor(() => screen.getByText("Reconhecer matemática")));

    expect(onAction).toHaveBeenCalledWith(
      "recognize-math",
      expect.objectContaining({ pageNumber: 7 }),
    );
  });

  it("recorte descartado desabilita, e o botão não chama nada", async () => {
    withOrigin({ cropAssetId: null });
    const onAction = vi.fn();
    render(<OriginPanel questionId="q1" onAction={onAction} />);

    const button = (await waitFor(() => screen.getByText("Inserir como figura"))).closest(
      "button",
    )!;
    fireEvent.click(button);

    expect(button.disabled).toBe(true);
    expect(onAction).not.toHaveBeenCalled();
  });
});

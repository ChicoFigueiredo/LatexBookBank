import { describe, expect, it, vi } from "vitest";

import {
  figurePreview,
  type CitedFigure,
  type FigurePreviewDeps,
} from "@modules/assets/application/figure-preview";

/**
 * A figura do preview rápido: o que o `\includegraphics` cita, numa forma que o navegador mostra.
 *
 * O recorte do scan é PDF — vetorial, para o LaTeX —, e `<img>` não abre PDF. O preview pede pelo
 * nome citado, e recebe PNG.
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

function deps(
  figure: CitedFigure | null,
  bytes: Uint8Array,
): FigurePreviewDeps & { rasterizePdf: ReturnType<typeof vi.fn>; find: ReturnType<typeof vi.fn> } {
  return {
    find: vi.fn(async () => figure),
    read: async () => bytes,
    rasterizePdf: vi.fn(async () => PNG),
  };
}

describe("a figura do preview rápido", () => {
  it("o recorte em PDF vira PNG", async () => {
    const d = deps({ storageKey: "k", mimeType: "application/pdf", sha256: "4cba19e1ff" }, PDF);
    const preview = await figurePreview("figura-p410-4cba19e1.pdf", d);
    expect(preview).toEqual({ bytes: PNG, mimeType: "image/png", sha256: "4cba19e1ff" });
    expect(d.rasterizePdf).toHaveBeenCalledWith(PDF);
    expect(d.find).toHaveBeenCalledWith("figura-p410-4cba19e1.pdf", "4cba19e1");
  });

  it("a imagem que já é PNG ou JPEG vai como está", async () => {
    const d = deps({ storageKey: "k", mimeType: "image/jpeg", sha256: "aabbccdd00" }, PNG);
    expect(await figurePreview("foto-aabbccdd.jpg", d)).toEqual({
      bytes: PNG,
      mimeType: "image/jpeg",
      sha256: "aabbccdd00",
    });
    expect(d.rasterizePdf).not.toHaveBeenCalled();
  });

  it("nome sem o hash de um asset nem chega a procurar", async () => {
    const d = deps(null, PNG);
    expect(await figurePreview("grafico.png", d)).toBeNull();
    expect(d.find).not.toHaveBeenCalled();
  });

  it("figura que não está no acervo, ou de tipo que o navegador não deve abrir, não tem preview", async () => {
    expect(await figurePreview("figura-p410-4cba19e1.pdf", deps(null, PDF))).toBeNull();
    const svg = deps({ storageKey: "k", mimeType: "image/svg+xml", sha256: "4cba19e1ff" }, PNG);
    expect(await figurePreview("desenho-4cba19e1.svg", svg)).toBeNull();
  });
});

import { NextResponse } from "next/server";

import { figurePreview, type FigurePreview } from "@modules/assets/application/figure-preview";
import { findCitedFigure } from "@modules/assets/infrastructure/prisma-cited-figure";
import { PdfjsDocumentReader } from "@modules/scan/infrastructure/pdfjs-document-reader";
import { storage } from "@infrastructure/composition";
import { servedContentHeaders } from "@/shared/http/served-content";
import { asStorageKey } from "@/shared/ports";

import { withErrors } from "../../../../http";

/**
 * A figura que o LaTeX de uma publicação cita, para o preview rápido — em PNG.
 *
 * O preview pede pelo nome do `\includegraphics` ("figura-p410-4cba19e1.pdf"), e o recorte do
 * scan é PDF, que `<img>` não abre: o PDF vira a primeira página rasterizada (`figurePreview`).
 *
 * O nome carrega o começo do sha256, então o PNG de um nome é sempre o mesmo: cache imutável no
 * navegador, e um cache curto aqui para não rasterizar de novo a cada abertura da questão. Como a
 * rota de conteúdo de asset, esta não autoriza — quem tem a publicação e o nome chega à figura.
 */
export const dynamic = "force-dynamic";

/** A rasterização da figura, em pontos por polegada: nítida na tela sem pesar. */
const PREVIEW_DPI = 200;
const WHOLE_PAGE = { x: 0, y: 0, width: 1, height: 1 };

const CACHE_LIMIT = 256;
const cache = new Map<string, FigurePreview>();

async function rasterizePdf(pdf: Uint8Array): Promise<Uint8Array> {
  const opened = await new PdfjsDocumentReader().open(pdf);
  try {
    return await opened.renderRegion(1, WHOLE_PAGE, PREVIEW_DPI);
  } finally {
    await opened.close();
  }
}

export const GET = withErrors(async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; name: string }> },
) {
  const { id, name } = await params;
  const key = `${id}\u0000${name}`;

  let preview = cache.get(key) ?? null;
  if (preview === null) {
    preview = await figurePreview(name, {
      find: (citedName, hash) => findCitedFigure(id, citedName, hash),
      read: async (storageKey) =>
        new Uint8Array((await storage().get(asStorageKey(storageKey))).content),
      rasterizePdf,
    });
    if (preview === null) {
      return NextResponse.json(
        { error: "not_found", message: "Esta figura não está no acervo da publicação." },
        { status: 404 },
      );
    }
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(key, preview);
  }

  return new Response(new Uint8Array(preview.bytes), {
    headers: servedContentHeaders({
      mimeType: preview.mimeType,
      sizeBytes: preview.bytes.byteLength,
      filename: name.replace(/\.[a-z0-9]+$/, preview.mimeType === "image/png" ? ".png" : ".jpg"),
    }),
  });
});

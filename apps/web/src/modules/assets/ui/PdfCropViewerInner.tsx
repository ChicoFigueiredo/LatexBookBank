"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button, injectCss } from "@/design-system";
import {
  clampToPage,
  CURSORS,
  handleAt,
  isUsable,
  rectFromDrag,
  resize,
  type Handle,
  type Point,
} from "@modules/assets/domain/crop-interaction";
import { normalizedBoxFrom, type PixelRect } from "@modules/assets/domain/source-anchor";

/**
 * O visualizador de PDF com recorte.
 *
 * As regras — arrastar, redimensionar, prender à página — moram em `crop-interaction.ts` e são
 * testadas lá. Aqui fica só o que precisa de canvas: rasterizar a página e recortar o que está na
 * tela.
 *
 * **O recorte é feito no cliente de propósito.** A página já foi rasterizada para ser mostrada, e
 * recortá-la custa uma chamada de `drawImage` — rasterizar de novo no servidor custaria um
 * processo por recorte, para produzir a mesma imagem que a pessoa está vendo.
 *
 * O que sobe é a **caixa normalizada** mais o PNG (D28). A imagem é conveniência; a âncora é o
 * dado, e é ela que sobrevive a uma mudança de zoom, de DPI ou de ferramenta.
 *
 * Ver spec §18 · D28 · issue #133.
 */

const CSS = `
.lbb-pdf{display:flex;flex-direction:column;gap:var(--space-2);min-height:0}
.lbb-pdf-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid var(--border-subtle)}
.lbb-pdf-info{font-family:var(--font-mono);font-size:var(--text-micro);color:var(--text-secondary)}
.lbb-pdf-stage{position:relative;overflow:auto;flex:1;min-height:0;background:var(--surface-sunken);display:flex;justify-content:center;padding:var(--space-3)}
.lbb-pdf-holder{position:relative;line-height:0}
.lbb-pdf-canvas{box-shadow:var(--shadow-md);background:white}
.lbb-pdf-rect{position:absolute;border:2px solid var(--accent);background:color-mix(in srgb, var(--accent) 12%, transparent);pointer-events:none}
.lbb-pdf-handle{position:absolute;width:10px;height:10px;background:var(--surface);border:2px solid var(--accent);border-radius:2px;pointer-events:none}
`;

export interface PdfCropViewerInnerProps {
  readonly fileUrl: string;
  /** Chamado ao salvar: caixa normalizada, página e os bytes do recorte. */
  readonly onCrop: (crop: {
    pageNumber: number;
    box: { x: number; y: number; width: number; height: number };
    png: Blob;
  }) => void;
  readonly initialScale?: number;
}

export default function PdfCropViewerInner({
  fileUrl,
  onCrop,
  initialScale = 1.2,
}: PdfCropViewerInnerProps) {
  injectCss("lbb-pdf-css", CSS);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const docRef = useRef<{ numPages: number; getPage: (n: number) => Promise<unknown> } | null>(
    null,
  );

  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(initialScale);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [rect, setRect] = useState<PixelRect | null>(null);
  const [hover, setHover] = useState<Handle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const drag = useRef<{ handle: Handle | "new"; origin: Point; base: PixelRect | null } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        // Import dinâmico: `pdfjs-dist` toca `window` ao carregar, e o worker precisa de uma URL
        // que só existe no navegador.
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        // `{ url }` e não a string direta: esta versão do `pdfjs-dist` só aceita o objeto de
        // parâmetros, e a forma antiga falha em tempo de tipo.
        const doc = await pdfjs.getDocument({ url: fileUrl }).promise;
        if (cancelled) return;

        docRef.current = doc as unknown as typeof docRef.current;
        setPageCount(doc.numPages);
      } catch (problem) {
        if (!cancelled) setError(problem instanceof Error ? problem.message : "PDF não abriu.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (doc === null || canvas === null || pageCount === 0) return;

    let cancelled = false;

    void (async () => {
      const page = (await doc.getPage(pageNumber)) as {
        getViewport: (options: { scale: number }) => { width: number; height: number };
        render: (options: unknown) => { promise: Promise<void> };
      };

      const viewport = page.getViewport({ scale });
      if (cancelled) return;

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      setSize({ width: canvas.width, height: canvas.height });

      const context = canvas.getContext("2d");
      if (context === null) return;

      await page.render({ canvasContext: context, viewport, canvas }).promise;
    })();

    return () => {
      cancelled = true;
    };
    // `pageCount` entra para o primeiro render acontecer assim que o documento abre.
  }, [pageNumber, scale, pageCount]);

  const pointFrom = useCallback((event: React.MouseEvent): Point => {
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }, []);

  const onMouseDown = (event: React.MouseEvent) => {
    const point = pointFrom(event);
    const handle = rect === null ? null : handleAt(point, rect);

    drag.current =
      handle === null
        ? { handle: "new", origin: point, base: null }
        : { handle, origin: point, base: rect };

    if (handle === null) setRect(clampToPage({ ...point, width: 0, height: 0 }, size));
  };

  const onMouseMove = (event: React.MouseEvent) => {
    const current = drag.current;

    // O cursor segue a alça sob o ponteiro **mesmo sem arrastar** — é o que diz à pessoa que o
    // canto é pegável antes de ela tentar. A primeira versão consultava um ponto fixo e o cursor
    // nunca mudava.
    if (current === null) {
      setHover(rect === null ? null : handleAt(pointFrom(event), rect));
      return;
    }

    const point = pointFrom(event);
    if (rect !== null) setHover(handleAt(point, rect));

    if (current.handle === "new") {
      setRect(rectFromDrag(current.origin, point, size));
      return;
    }
    if (current.base === null) return;

    setRect(
      resize(
        current.base,
        current.handle,
        { x: point.x - current.origin.x, y: point.y - current.origin.y },
        size,
      ),
    );
  };

  const endDrag = () => {
    drag.current = null;
    // Desenho pequeno demais é clique, não recorte — e um retângulo de dois pixels na tela seria
    // impossível de pegar de volta para ajustar.
    setRect((current) => (current !== null && !isUsable(current) ? null : current));
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (canvas === null || rect === null || !isUsable(rect)) return;

    const cut = document.createElement("canvas");
    cut.width = Math.round(rect.width);
    cut.height = Math.round(rect.height);

    const context = cut.getContext("2d");
    if (context === null) return;

    context.drawImage(
      canvas,
      Math.round(rect.x),
      Math.round(rect.y),
      cut.width,
      cut.height,
      0,
      0,
      cut.width,
      cut.height,
    );

    cut.toBlob((png) => {
      if (png === null) return;
      // A caixa vai **normalizada**: é ela que sobrevive a uma mudança de zoom ou de DPI.
      onCrop({ pageNumber, box: normalizedBoxFrom(rect, size), png });
    }, "image/png");
  };

  if (error !== null) {
    return (
      <div className="lbb-pdf" style={{ padding: "var(--space-4)" }}>
        <span className="lbb-pdf-info">Não deu para abrir o PDF: {error}</span>
      </div>
    );
  }

  const cursor = hover === null ? "crosshair" : CURSORS[hover];

  return (
    <div className="lbb-pdf">
      <div className="lbb-pdf-bar">
        <Button
          size="sm"
          variant="ghost"
          disabled={pageNumber <= 1}
          onClick={() => setPageNumber((n) => Math.max(1, n - 1))}
        >
          Anterior
        </Button>
        <span className="lbb-pdf-info">
          {pageCount === 0 ? "abrindo…" : `página ${pageNumber} de ${pageCount}`}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={pageNumber >= pageCount}
          onClick={() => setPageNumber((n) => Math.min(pageCount, n + 1))}
        >
          Próxima
        </Button>

        <span className="lbb-pdf-info">{Math.round(scale * 100)}%</span>
        <Button size="sm" variant="ghost" onClick={() => setScale((s) => Math.max(0.4, s - 0.2))}>
          −
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setScale((s) => Math.min(4, s + 0.2))}>
          +
        </Button>

        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {rect !== null && (
            <Button size="sm" variant="ghost" onClick={() => setRect(null)}>
              Limpar recorte
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            disabled={rect === null || !isUsable(rect)}
            onClick={save}
          >
            Salvar recorte
          </Button>
        </span>
      </div>

      <div className="lbb-pdf-stage">
        <div
          className="lbb-pdf-holder"
          style={{ cursor }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={endDrag}
          // Soltar o botão fora da página é comum ao arrastar até a borda; sem isto o retângulo
          // ficaria preso ao mouse depois que a pessoa já soltou.
          onMouseLeave={endDrag}
        >
          <canvas ref={canvasRef} className="lbb-pdf-canvas" aria-label="Página do PDF" />

          {rect !== null && (
            <>
              <div
                className="lbb-pdf-rect"
                style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
              />
              {handlePositions(rect).map(([handle, point]) => (
                <div
                  key={handle}
                  className="lbb-pdf-handle"
                  style={{ left: point.x - 5, top: point.y - 5 }}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** As oito alças, para desenhar. A regra de qual está sob o cursor mora no domínio. */
function handlePositions(rect: PixelRect): ReadonlyArray<readonly [string, Point]> {
  const { x, y, width: w, height: h } = rect;

  return [
    ["nw", { x, y }],
    ["n", { x: x + w / 2, y }],
    ["ne", { x: x + w, y }],
    ["e", { x: x + w, y: y + h / 2 }],
    ["se", { x: x + w, y: y + h }],
    ["s", { x: x + w / 2, y: y + h }],
    ["sw", { x, y: y + h }],
    ["w", { x, y: y + h / 2 }],
  ];
}

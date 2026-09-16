"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

import { Button, IconButton, injectCss } from "@/design-system";
import {
  CURSORS,
  handleAt,
  isUsable,
  rectFromDrag,
  resize,
  type Handle,
  type Point,
} from "@modules/assets/domain/crop-interaction";
import { normalizedBoxFrom, type NormalizedBox, type PixelRect } from "@modules/assets/domain/source-anchor";
import type { Overlay, OverlayTone } from "@modules/scan/domain/workspace-view";

/**
 * O PDF fonte com as âncoras por cima (§33 do prompt 03): a página inteira, nunca só o recorte,
 * para a pessoa responder "o sistema pegou o trecho certo?".
 *
 * Cada marca é clicável — clicar seleciona o item dela (§35). A âncora escolhida ganha alças para
 * redimensionar, e o modo de desenho cria uma âncora nova. Tudo em frações da página (D28): o
 * zoom é de quem olha, e a caixa que se grava não depende dele.
 */

const CSS = `
.lbb-scan-viewer{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--surface-sunken)}
.lbb-scan-viewer-bar{display:flex;align-items:center;gap:var(--space-2);padding:var(--space-2) var(--space-3);border-bottom:1px solid var(--border-subtle);background:var(--surface);font-size:var(--text-meta);color:var(--text-secondary)}
.lbb-scan-viewer-bar .grow{flex:1}
.lbb-scan-viewer-scroll{flex:1;overflow:auto;min-height:0;padding:var(--space-4)}
.lbb-scan-viewer-page{position:relative;margin:0 auto;box-shadow:var(--shadow-md);background:var(--surface-paper);touch-action:none}
.lbb-scan-viewer-page canvas{display:block}
.lbb-scan-mark{position:absolute;border:1.5px solid;border-radius:2px;cursor:pointer}
.lbb-scan-mark-label{position:absolute;top:-1px;left:-1px;transform:translateY(-100%);padding:0 4px;font-family:var(--font-mono);font-size:10px;line-height:14px;white-space:nowrap;border-radius:2px 2px 0 0;pointer-events:none}
.lbb-scan-mark[data-tone="structure"]{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 6%,transparent)}
.lbb-scan-mark[data-tone="question"]{border-color:var(--info);background:color-mix(in srgb,var(--info) 6%,transparent)}
.lbb-scan-mark[data-tone="content"]{border-color:var(--border-strong);border-style:dashed;background:transparent}
.lbb-scan-mark[data-tone="accepted"]{border-color:var(--ok);background:color-mix(in srgb,var(--ok) 6%,transparent)}
.lbb-scan-mark[data-tone="rejected"]{border-color:var(--text-disabled);border-style:dotted;background:transparent;opacity:.6}
.lbb-scan-mark[data-tone="warning"]{border-color:var(--warn);background:color-mix(in srgb,var(--warn) 10%,transparent)}
.lbb-scan-mark[data-tone="selected"]{border:2.5px solid var(--danger);background:color-mix(in srgb,var(--danger) 10%,transparent);z-index:2}
.lbb-scan-mark[data-tone="selected"] .lbb-scan-mark-label{background:var(--danger);color:var(--text-inverse)}
.lbb-scan-mark:not([data-tone="selected"]) .lbb-scan-mark-label{display:none}
.lbb-scan-mark:hover .lbb-scan-mark-label{display:block;background:var(--surface-raised);color:var(--text-primary);border:1px solid var(--border-default)}
.lbb-scan-handle{position:absolute;width:9px;height:9px;margin:-5px 0 0 -5px;background:var(--surface-paper);border:1.5px solid var(--danger);border-radius:1px;pointer-events:none;z-index:3}
.lbb-scan-draft{position:absolute;border:2px dashed var(--danger);background:color-mix(in srgb,var(--danger) 8%,transparent);pointer-events:none;z-index:4}
.lbb-scan-viewer-error{padding:var(--space-6);color:var(--danger-text)}
`;

export interface SourcePdfViewerProps {
  readonly fileUrl: string;
  readonly pageNumber: number;
  readonly onPageChange: (page: number) => void;
  readonly overlays: readonly Overlay[];
  readonly onSelect?: (id: string, regionIndex: number) => void;
  /** A âncora que ganha alças. */
  readonly editable?: { readonly id: string; readonly regionIndex: number } | null;
  readonly onResize?: (id: string, regionIndex: number, box: NormalizedBox) => void;
  /** Com isto ligado, arrastar desenha uma âncora nova em vez de selecionar. */
  readonly drawing?: boolean;
  readonly onDraw?: (pageNumber: number, box: NormalizedBox) => void;
  readonly onPageCount?: (count: number) => void;
}

interface PdfDoc {
  readonly numPages: number;
  getPage(n: number): Promise<{
    getViewport(o: { scale: number }): { width: number; height: number };
    render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown; canvas: HTMLCanvasElement }): { promise: Promise<void>; cancel(): void };
  }>;
}

const HANDLE_POINTS: readonly (readonly [Handle, (r: PixelRect) => Point])[] = [
  ["nw", (r) => ({ x: r.x, y: r.y })],
  ["ne", (r) => ({ x: r.x + r.width, y: r.y })],
  ["sw", (r) => ({ x: r.x, y: r.y + r.height })],
  ["se", (r) => ({ x: r.x + r.width, y: r.y + r.height })],
  ["n", (r) => ({ x: r.x + r.width / 2, y: r.y })],
  ["s", (r) => ({ x: r.x + r.width / 2, y: r.y + r.height })],
  ["w", (r) => ({ x: r.x, y: r.y + r.height / 2 })],
  ["e", (r) => ({ x: r.x + r.width, y: r.y + r.height / 2 })],
];

const toPixels = (box: NormalizedBox, size: { width: number; height: number }): PixelRect => ({
  x: box.x * size.width,
  y: box.y * size.height,
  width: box.width * size.width,
  height: box.height * size.height,
});

type Gesture =
  | { readonly type: "draw"; readonly start: Point; readonly current: Point }
  | { readonly type: "resize"; readonly handle: Handle; readonly start: Point; readonly origin: PixelRect; readonly current: PixelRect };

export default function SourcePdfViewerInner({
  fileUrl,
  pageNumber,
  onPageChange,
  overlays,
  onSelect,
  editable = null,
  onResize,
  drawing = false,
  onDraw,
  onPageCount,
}: SourcePdfViewerProps) {
  injectCss("lbb-scan-viewer", CSS);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.3);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [hoverHandle, setHoverHandle] = useState<Handle | null>(null);
  const countRef = useRef(onPageCount);
  useEffect(() => {
    countRef.current = onPageCount;
  }, [onPageCount]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const loaded = (await pdfjs.getDocument({ url: fileUrl }).promise) as unknown as PdfDoc;
        if (cancelled) return;
        setDoc(loaded);
        countRef.current?.(loaded.numPages);
      } catch (problem) {
        if (!cancelled) setError(problem instanceof Error ? problem.message : "O PDF não abriu.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;
    let cancelled = false;
    let task: { cancel(): void } | null = null;

    void (async () => {
      const page = await doc.getPage(Math.min(Math.max(1, pageNumber), doc.numPages));
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) return;
      const render = page.render({ canvasContext: context, viewport, canvas });
      task = render;
      try {
        await render.promise;
        if (!cancelled) setSize({ width: canvas.width, height: canvas.height });
      } catch {
        // Render cancelado por troca de página ou zoom: o próximo desenha.
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNumber, scale]);

  // A âncora escolhida entra na vista: numa página de livro, ela costuma estar na metade de baixo.
  const pageRef = useRef<HTMLDivElement | null>(null);
  const selectedKey = overlays.find((overlay) => overlay.tone === "selected");
  const selectedTop = selectedKey && size ? selectedKey.box.y : null;
  useEffect(() => {
    if (selectedTop === null) return;
    pageRef.current
      ?.querySelector('[data-tone="selected"]')
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selectedTop, pageNumber]);

  const editableRect = (() => {
    if (!editable || !size) return null;
    const overlay = overlays.find((o) => o.id === editable.id && o.regionIndex === editable.regionIndex);
    return overlay ? toPixels(overlay.box, size) : null;
  })();

  const pointOf = (event: PointerEvent<HTMLDivElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!size) return;
      const point = pointOf(event);
      if (drawing) {
        event.currentTarget.setPointerCapture(event.pointerId);
        setGesture({ type: "draw", start: point, current: point });
        event.preventDefault();
        return;
      }
      if (editableRect) {
        const handle = handleAt(point, editableRect);
        if (handle) {
          event.currentTarget.setPointerCapture(event.pointerId);
          setGesture({ type: "resize", handle, start: point, origin: editableRect, current: editableRect });
          event.preventDefault();
        }
      }
    },
    [drawing, editableRect, size],
  );

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!size) return;
    const point = pointOf(event);
    if (!gesture) {
      setHoverHandle(editableRect && !drawing ? handleAt(point, editableRect) : null);
      return;
    }
    if (gesture.type === "draw") setGesture({ ...gesture, current: point });
    else {
      const delta = { x: point.x - gesture.start.x, y: point.y - gesture.start.y };
      setGesture({ ...gesture, current: resize(gesture.origin, gesture.handle, delta, size) });
    }
  };

  const onPointerUp = () => {
    if (!gesture || !size) return;
    if (gesture.type === "draw") {
      const rect = rectFromDrag(gesture.start, gesture.current, size);
      if (isUsable(rect)) onDraw?.(pageNumber, normalizedBoxFrom(rect, size));
    } else if (editable && isUsable(gesture.current)) {
      onResize?.(editable.id, editable.regionIndex, normalizedBoxFrom(gesture.current, size));
    }
    setGesture(null);
  };

  const pages = doc?.numPages ?? 0;
  const liveEditable = gesture?.type === "resize" ? gesture.current : editableRect;
  const draft = gesture?.type === "draw" && size ? rectFromDrag(gesture.start, gesture.current, size) : null;
  const cursor = drawing ? "crosshair" : hoverHandle ? CURSORS[hoverHandle] : undefined;

  return (
    <div className="lbb-scan-viewer">
      <div className="lbb-scan-viewer-bar">
        <IconButton
          icon="chevron-left"
          aria-label="Página anterior"
          disabled={pageNumber <= 1}
          onClick={() => onPageChange(pageNumber - 1)}
        />
        <span>
          Página {pageNumber} de {pages || "…"}
        </span>
        <IconButton
          icon="chevron-right"
          aria-label="Próxima página"
          disabled={pages === 0 || pageNumber >= pages}
          onClick={() => onPageChange(pageNumber + 1)}
        />
        <span className="grow" />
        <Button variant="ghost" size="sm" onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}>
          −
        </Button>
        <span>{Math.round(scale * 100)}%</span>
        <Button variant="ghost" size="sm" onClick={() => setScale((s) => Math.min(3, s + 0.2))}>
          +
        </Button>
      </div>

      <div className="lbb-scan-viewer-scroll">
        {error ? (
          <div className="lbb-scan-viewer-error">Não deu para abrir o PDF: {error}</div>
        ) : (
          <div
            ref={pageRef}
            className="lbb-scan-viewer-page"
            style={size ? { width: size.width, height: size.height, cursor } : undefined}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            data-testid="scan-pdf-page"
          >
            <canvas ref={canvasRef} />
            {size &&
              overlays.map((overlay) => {
                const rect =
                  editable && overlay.id === editable.id && overlay.regionIndex === editable.regionIndex && liveEditable
                    ? liveEditable
                    : toPixels(overlay.box, size);
                return (
                  <div
                    key={`${overlay.id}:${overlay.regionIndex}`}
                    className="lbb-scan-mark"
                    data-tone={overlay.tone satisfies OverlayTone}
                    data-testid="scan-mark"
                    title={overlay.label}
                    style={{
                      left: rect.x,
                      top: rect.y,
                      width: rect.width,
                      height: rect.height,
                      pointerEvents: drawing || hoverHandle ? "none" : undefined,
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect?.(overlay.id, overlay.regionIndex);
                    }}
                  >
                    <span className="lbb-scan-mark-label">{overlay.label}</span>
                  </div>
                );
              })}
            {liveEditable &&
              !drawing &&
              HANDLE_POINTS.map(([handle, at]) => {
                const point = at(liveEditable);
                return <span key={handle} className="lbb-scan-handle" style={{ left: point.x, top: point.y }} />;
              })}
            {draft && (
              <div className="lbb-scan-draft" style={{ left: draft.x, top: draft.y, width: draft.width, height: draft.height }} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

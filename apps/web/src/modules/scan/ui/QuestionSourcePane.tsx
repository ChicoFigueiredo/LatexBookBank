"use client";

import { useCallback, useEffect, useState } from "react";

import { Banner, Button, injectCss } from "@/design-system";
import type { NormalizedBox } from "@modules/assets/domain/source-anchor";
import { cycleRegion, type Overlay } from "@modules/scan/domain/workspace-view";

import { SourcePdfViewer } from "./SourcePdfViewer";

/**
 * *Ver fonte* (D43): o PDF do livro no lugar do painel direito do editor, aberto na página da
 * âncora e com **todas** as âncoras da questão marcadas (D47). Dá para ir de uma a outra, marcar
 * mais uma e retirar a que não pertence — a condição que o autor pôs ao aceitar o vocabulário.
 */

const CSS = `
.lbb-source-pane{display:flex;flex-direction:column;height:100%;min-height:0}
.lbb-source-pane-bar{display:flex;align-items:center;gap:var(--space-2);padding:var(--space-2) var(--space-3);border-bottom:1px solid var(--border-subtle);font-size:var(--text-meta);white-space:nowrap;flex-wrap:wrap}
.lbb-source-pane-bar .grow{flex:1}
`;

export interface AnchorView {
  readonly sourceAnchorId: string;
  readonly role: string;
  readonly sourceAssetId: string;
  readonly pageNumber: number;
  readonly box: NormalizedBox;
}

const ROLE_LABELS: Readonly<Record<string, string>> = {
  PRIMARY: "principal",
  CONTINUATION: "continuação",
  ILLUSTRATION: "ilustração",
  ANSWER: "resposta",
  SOLUTION: "resolução",
  FOOTNOTE: "nota",
};

export function QuestionSourcePane({ questionId }: { readonly questionId: string }) {
  injectCss("lbb-source-pane", CSS);
  const [anchors, setAnchors] = useState<readonly AnchorView[]>([]);
  const [sourceAssetId, setSourceAssetId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [current, setCurrent] = useState(0);
  const [page, setPage] = useState(1);
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [age, setAge] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/questions/${questionId}/anchors`)
      .then((response) => response.json() as Promise<{ sourceAssetId: string | null; anchors: AnchorView[] }>)
      .then((payload) => {
        if (cancelled) return;
        setAnchors(payload.anchors);
        setSourceAssetId(payload.sourceAssetId);
        setLoaded(true);
        setCurrent((index) => Math.min(index, Math.max(0, payload.anchors.length - 1)));
        const first = payload.anchors[0];
        if (first && age === 0) setPage(first.pageNumber);
      })
      .catch(() => !cancelled && setError("Não deu para ler as âncoras desta questão."));
    return () => {
      cancelled = true;
    };
  }, [questionId, age]);

  const go = useCallback(
    (index: number) => {
      setCurrent(index);
      const anchor = anchors[index];
      if (anchor) setPage(anchor.pageNumber);
    },
    [anchors],
  );

  const add = async (pageNumber: number, box: NormalizedBox) => {
    setDrawing(false);
    setError(null);
    const response = await fetch(`/api/questions/${questionId}/anchors`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageNumber, box, role: anchors.length === 0 ? "PRIMARY" : "CONTINUATION" }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      setError(payload.message ?? "Não deu para marcar a âncora.");
      return;
    }
    setCurrent(anchors.length);
    setAge((n) => n + 1);
  };

  const remove = async (anchorId: string) => {
    setError(null);
    const response = await fetch(`/api/questions/${questionId}/anchors/${anchorId}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      setError(payload.message ?? "Não deu para retirar a âncora.");
      return;
    }
    setAge((n) => n + 1);
  };

  if (!loaded) return <div style={{ padding: 16, color: "var(--text-muted)" }}>Lendo a origem…</div>;
  if (!sourceAssetId) {
    return (
      <div style={{ padding: 16, color: "var(--text-muted)" }}>
        Esta questão não tem origem no PDF, e o livro não tem PDF fonte anexado.
      </div>
    );
  }

  const overlays: Overlay[] = anchors
    .filter((anchor) => anchor.pageNumber === page)
    .map((anchor) => {
      const index = anchors.indexOf(anchor);
      return {
        id: anchor.sourceAnchorId,
        regionIndex: index,
        box: anchor.box,
        tone: index === current ? "selected" : "question",
        label: `${index + 1}/${anchors.length} · ${ROLE_LABELS[anchor.role] ?? anchor.role}`,
      };
    });
  const active = anchors[current];

  return (
    <div className="lbb-source-pane" data-testid="source-pane">
      <div className="lbb-source-pane-bar">
        {anchors.length > 0 ? (
          <>
            <Button size="sm" variant="ghost" disabled={anchors.length < 2} onClick={() => go(cycleRegion(anchors.length, current, -1))}>
              ◀
            </Button>
            <span>
              Âncora {current + 1} de {anchors.length}
              {active ? ` · ${ROLE_LABELS[active.role] ?? active.role}` : ""}
            </span>
            <Button size="sm" variant="ghost" disabled={anchors.length < 2} onClick={() => go(cycleRegion(anchors.length, current, 1))}>
              ▶
            </Button>
          </>
        ) : (
          <span>Sem âncora ainda: marque de onde a questão veio.</span>
        )}
        <span className="grow" />
        <Button size="sm" variant={drawing ? "primary" : "secondary"} icon="plus" onClick={() => setDrawing((d) => !d)}>
          {drawing ? "Desenhe no PDF…" : "Marcar âncora"}
        </Button>
        {active && (
          <Button size="sm" variant="ghost" onClick={() => void remove(active.sourceAnchorId)}>
            Retirar esta
          </Button>
        )}
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      <div style={{ flex: 1, minHeight: 0 }}>
        <SourcePdfViewer
          fileUrl={`/api/assets/${sourceAssetId}/content`}
          pageNumber={page}
          onPageChange={setPage}
          overlays={overlays}
          onSelect={(_id, index) => setCurrent(index)}
          drawing={drawing}
          onDraw={(pageNumber, box) => void add(pageNumber, box)}
        />
      </div>
    </div>
  );
}

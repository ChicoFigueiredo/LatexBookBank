"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Badge, Banner, Button, Divider, Tabs, useStoredState } from "@/design-system";
import type { NormalizedBox } from "@modules/assets/domain/source-anchor";
import { LatexEditor, type LatexEditorApi } from "@modules/latex/ui/LatexEditor";
import { PreviewPane } from "@modules/preview/ui/PreviewPane";
import { RenderPanel } from "@modules/rendering/ui/RenderPanel";
import { useRender } from "@modules/rendering/ui/use-render";
import { SourcePdfViewer } from "@modules/scan/ui/SourcePdfViewer";

import { useEditorColumns } from "./editor-columns";

/**
 * O corpo de um capítulo ou seção (D42, ADR 0001): a teoria, editada no mesmo Monaco da questão,
 * com preview rápido, compilação pelo mesmo worker e histórico. A disciplina de salvar é a mesma:
 * autosave com pausa, e conflito que para e avisa em vez de sobrescrever.
 */

const AUTOSAVE_DELAY_MS = 1200;

type SaveState = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";
type RightTab = "rapido" | "render" | "historico";

interface BodyPayload {
  readonly bodyLatex: string;
  readonly version: string;
  readonly canHaveBody: boolean;
  readonly anchors: readonly {
    readonly sourceAnchorId: string;
    readonly role: string;
    readonly sourceAssetId: string;
    readonly pageNumber: number;
    readonly box: NormalizedBox;
  }[];
  readonly revisions: readonly {
    readonly revisionNumber: number;
    readonly origin: string;
    readonly summary: string;
    readonly createdAt: string;
  }[];
}

export function NodeBodyEditor({
  publicationId,
  nodeId,
}: {
  readonly publicationId: string;
  readonly nodeId: string;
}) {
  const [data, setData] = useState<BodyPayload | null>(null);
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>("rapido");
  const [sourceOpen, setSourceOpen] = useStoredState(`lbb:ver-fonte:${publicationId}`, false);
  const [page, setPage] = useState(1);
  /** O cursor no corpo, para acender o bloco correspondente no preview (D55). */
  const [cursorOffset, setCursorOffset] = useState(0);
  const editor = useRef<LatexEditorApi | null>(null);
  const version = useRef<string>("");
  const draftRef = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apply = useCallback((payload: BodyPayload) => {
    setData(payload);
    setDraft(payload.bodyLatex);
    draftRef.current = payload.bodyLatex;
    version.current = payload.version;
    const first = payload.anchors[0];
    if (first) setPage(first.pageNumber);
  }, []);

  const fetchBody = useCallback(
    () =>
      fetch(`/api/publications/${publicationId}/nodes/${nodeId}/body`).then((response) =>
        response.ok ? (response.json() as Promise<BodyPayload>) : null,
      ),
    [nodeId, publicationId],
  );

  const load = useCallback(async () => {
    const payload = await fetchBody();
    if (payload) apply(payload);
  }, [apply, fetchBody]);

  useEffect(() => {
    let cancelled = false;
    void fetchBody().then((payload) => {
      if (!cancelled && payload) apply(payload);
    });
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [apply, fetchBody]);

  const save = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setState("saving");
    try {
      const response = await fetch(`/api/publications/${publicationId}/nodes/${nodeId}/body`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: version.current, bodyLatex: draftRef.current }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        version?: string;
        message?: string;
      };
      if (response.status === 409) {
        setState("conflict");
        setMessage(payload.message ?? "Este nó mudou desde que você abriu.");
        return;
      }
      if (!response.ok) {
        setState("error");
        setMessage(payload.message ?? "Não deu para salvar.");
        return;
      }
      if (payload.version) version.current = payload.version;
      setState("saved");
      setMessage(null);
    } catch {
      setState("error");
      setMessage("Não deu para falar com o servidor. O texto continua na tela.");
    }
  }, [nodeId, publicationId]);

  const onChange = (value: string) => {
    setDraft(value);
    draftRef.current = value;
    if (state === "conflict") return;
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
  };

  const { status: renderStatus, render } = useRender({
    publicationId,
    questionId: nodeId,
    endpoint: `/api/publications/${publicationId}/nodes/${nodeId}/render`,
  });

  const anchors = data?.anchors ?? [];
  const showingSource = sourceOpen && anchors.length > 0;
  const sourceAssetId = anchors[0]?.sourceAssetId ?? null;
  const [columnsBox, setColumnsBox] = useState<HTMLDivElement | null>(null);
  const columns = useEditorColumns({
    container: columnsBox,
    previewOpen: true,
    sourceOpen: showingSource,
  });

  if (!data) return <div style={{ padding: 16, color: "var(--text-muted)" }}>Abrindo o corpo…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          padding: "6px 12px",
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        <strong style={{ fontSize: "var(--text-meta)" }}>Corpo da seção</strong>
        <span style={{ color: "var(--text-muted)", fontSize: "var(--text-meta)" }}>
          teoria, definições e exemplos — compila junto com as questões
        </span>
        <span style={{ flex: 1 }} />
        {anchors.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            icon="file-text"
            aria-pressed={showingSource}
            onClick={() => setSourceOpen(!sourceOpen)}
          >
            Ver fonte
          </Button>
        )}
        {state === "dirty" && <Badge tone="warn">não salvo</Badge>}
        {state === "saving" && <Badge tone="info">salvando…</Badge>}
        {state === "saved" && <Badge tone="ok">salvo</Badge>}
        {state === "conflict" && <Badge tone="warn">conflito</Badge>}
        {state === "error" && <Badge tone="danger">erro</Badge>}
      </div>
      {message && (
        <Banner
          tone={state === "conflict" ? "warn" : "danger"}
          actions={
            state === "conflict" ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void load().then(() => setState("idle"))}
              >
                Recarregar
              </Button>
            ) : undefined
          }
        >
          {message}
        </Banner>
      )}
      {/* Corpo, preview e fonte — as mesmas três colunas do editor da questão, e o mesmo rateio
          (`useEditorColumns`): o capítulo tem tanto direito ao PDF ao lado quanto o exercício. */}
      <div ref={setColumnsBox} style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0 }} data-testid="node-body-editor">
          <LatexEditor
            value={draft}
            onChange={onChange}
            onSave={() => void save()}
            onRender={render}
            onCursorOffset={setCursorOffset}
            onReady={(api) => {
              editor.current = api;
            }}
          />
        </div>
        <Divider {...columns.previewDivider} />
        <div
          style={{
            width: columns.previewWidth,
            flexShrink: 0,
            minWidth: 0,
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            borderLeft: "1px solid var(--border-default)",
          }}
        >
          <div style={{ display: "flex", gap: 4, padding: "6px 12px 0", alignItems: "center" }}>
            <Tabs
              tabs={[
                { id: "rapido", label: "Preview rápido" },
                { id: "render", label: "PDF compilado" },
                { id: "historico", label: "Histórico" },
              ]}
              value={rightTab}
              onChange={(id) => setRightTab(id as RightTab)}
              aria-label="Modo de visualização do corpo"
            />
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            {rightTab === "rapido" ? (
              <PreviewPane
                source={{
                  statementLatex: draft,
                  solutionLatex: "",
                  complementLatex: "",
                  options: [],
                }}
                // O corpo é um campo só: o cursor está sempre no "enunciado" do modelo.
                cursor={{ field: "statement", offset: cursorOffset }}
                onPick={(_field, offset) => editor.current?.goToOffset(offset)}
              />
            ) : rightTab === "render" ? (
              <RenderPanel
                status={renderStatus}
                onRender={render}
                sourceLatex={draft}
                questionKey={nodeId}
              />
            ) : (
              <ul
                style={{
                  margin: 0,
                  padding: 16,
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {data.revisions.length === 0 && (
                  <li style={{ color: "var(--text-muted)" }}>Sem revisões ainda.</li>
                )}
                {data.revisions.map((revision) => (
                  <li key={revision.revisionNumber}>
                    <strong>#{revision.revisionNumber}</strong> · {revision.summary || "edição"} ·{" "}
                    <span style={{ color: "var(--text-muted)" }}>
                      {revision.origin.toLowerCase()} ·{" "}
                      {new Date(revision.createdAt).toLocaleString("pt-BR")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {showingSource && sourceAssetId && (
          <>
            <Divider {...columns.sourceDivider} />
            <div
              style={{
                width: columns.sourceWidth,
                flexShrink: 0,
                minWidth: 0,
                minHeight: 0,
                overflow: "hidden",
                borderLeft: "1px solid var(--border-default)",
              }}
            >
              <SourcePdfViewer
                fileUrl={`/api/assets/${sourceAssetId}/content`}
                pageNumber={page}
                onPageChange={setPage}
                overlays={anchors
                  .filter((anchor) => anchor.pageNumber === page)
                  .map((anchor) => ({
                    id: anchor.sourceAnchorId,
                    regionIndex: anchors.indexOf(anchor),
                    box: anchor.box,
                    tone: anchor.role === "PRIMARY" ? "structure" : "content",
                    label: `${anchors.indexOf(anchor) + 1}/${anchors.length}`,
                  }))}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

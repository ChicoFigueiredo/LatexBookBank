"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge, Banner, Button, Checkbox, Select, Segmented, injectCss } from "@/design-system";
import type { ScanKind } from "@modules/scan/domain/proposal";
import type { ReviewOperation } from "@modules/scan/domain/review";
import type { ScanItem } from "@modules/scan/domain/scan-item";
import {
  countsByState,
  cycleRegion,
  FILTER_LABELS,
  filterWithAncestors,
  flattenTree,
  KIND_LABELS,
  overlaysForPage,
  type ViewFilter,
} from "@modules/scan/domain/workspace-view";

import { ScanPropertiesPanel } from "./ScanPropertiesPanel";
import { SourcePdfViewer } from "./SourcePdfViewer";
import { StructureTree } from "./StructureTree";
import { mergeItems, scanApi, type ApprovalResult, type ScanRunView } from "./scan-client";

/**
 * A revisão da proposta de scan (D47, §34–§37 do prompt 03): estrutura à esquerda, o PDF com as
 * âncoras ao centro, as propriedades à direita — numa tela própria, de largura inteira.
 *
 * Enquanto a execução anda, a tela só acompanha o estado (sem carregar itens a cada batida); pronta
 * a proposta, a lista chega e a revisão começa. Fechar a aba não para nada: o laço é do servidor.
 */

const CSS = `
.lbb-scan-ws{display:flex;flex-direction:column;height:calc(100vh - 96px);min-height:520px}
.lbb-scan-ws-top{display:flex;flex-wrap:wrap;gap:var(--space-2) var(--space-4);align-items:center;padding:var(--space-2) var(--space-4);border-bottom:1px solid var(--border-subtle);background:var(--surface)}
.lbb-scan-ws-top .grow{flex:1}
.lbb-scan-ws-top select{width:auto;max-width:260px}
.lbb-scan-ws-regions{white-space:nowrap}
.lbb-scan-ws-regions select{width:auto}
.lbb-scan-ws-grid{flex:1;display:grid;grid-template-columns:minmax(340px,27%) 1fr minmax(340px,26%);min-height:0}
.lbb-scan-ws-col{display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--border-subtle);background:var(--surface)}
.lbb-scan-ws-col:last-child{border-right:0}
.lbb-scan-ws-colhead{display:flex;gap:var(--space-2);align-items:center;padding:var(--space-2) var(--space-3);border-bottom:1px solid var(--border-subtle);font-size:var(--text-meta);color:var(--text-secondary);flex-wrap:wrap}
.lbb-scan-progress{width:160px;height:6px;border-radius:3px;background:var(--surface-sunken);overflow:hidden}
.lbb-scan-progress > span{display:block;height:100%;background:var(--accent)}
.lbb-scan-ws-empty{padding:var(--space-6);color:var(--text-muted)}
.lbb-scan-ws-regions{display:flex;align-items:center;gap:var(--space-2);padding:var(--space-1) var(--space-3);font-size:var(--text-meta);border-bottom:1px solid var(--border-subtle);background:var(--surface)}
`;

export interface ScanWorkspaceProps {
  readonly publicationId: string;
  readonly runId: string;
  readonly fileUrl: string;
  readonly profileLabel: string;
  readonly kinds: readonly ScanKind[];
  readonly destinations: readonly { readonly id: string; readonly title: string; readonly depth: number }[];
  readonly aiAvailable: boolean;
  readonly mathAvailable: boolean;
  readonly initial: { readonly run: ScanRunView; readonly items: readonly ScanItem[] };
}

const IN_PROGRESS = new Set(["QUEUED", "EXTRACTING", "ANALYZING_LAYOUT", "STRUCTURING", "SEMANTIC_REVIEW"]);
const FILTERS: readonly ViewFilter[] = ["all", "pending", "low", "problems", "structure"];

export function ScanWorkspace({
  publicationId,
  runId,
  fileUrl,
  profileLabel,
  kinds,
  destinations,
  aiAvailable,
  mathAvailable,
  initial,
}: ScanWorkspaceProps) {
  injectCss("lbb-scan-ws", CSS);

  const [run, setRun] = useState(initial.run);
  const [items, setItems] = useState<readonly ScanItem[]>(initial.items);
  const [selectedId, setSelectedId] = useState<string | null>(initial.items[0]?.id ?? null);
  const [regionIndex, setRegionIndex] = useState(0);
  const [page, setPage] = useState(initial.items[0]?.regions[0]?.pageNumber ?? initial.run.pageFrom);
  const [marked, setMarked] = useState<ReadonlySet<string>>(new Set());
  const [filter, setFilter] = useState<ViewFilter>("all");
  const [drawing, setDrawing] = useState<"region" | "item" | null>(null);
  const [newKind, setNewKind] = useState<ScanKind>(kinds.includes("EXERCISE") ? "EXERCISE" : (kinds[kinds.length - 1] ?? "QUESTION"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [destination, setDestination] = useState("");
  const [includeSuggested, setIncludeSuggested] = useState(true);
  const [approval, setApproval] = useState<ApprovalResult | null>(null);

  const inProgress = IN_PROGRESS.has(run.state);

  // Acompanhar a execução: só o estado enquanto anda, a proposta inteira quando termina.
  useEffect(() => {
    if (!inProgress || run.interrupted) return;
    const timer = window.setInterval(() => {
      void scanApi
        .get(runId, false)
        .then(async ({ run: next }) => {
          setRun(next);
          if (!IN_PROGRESS.has(next.state)) {
            const full = await scanApi.get(runId, true);
            setRun(full.run);
            setItems(full.items);
            setSelectedId((current) => current ?? full.items[0]?.id ?? null);
          }
        })
        .catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [inProgress, run.interrupted, runId]);

  const visible = useMemo(() => filterWithAncestors(items, filter), [items, filter]);
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const counts = useMemo(() => countsByState(items), [items]);
  const overlays = useMemo(() => overlaysForPage(items, page, selectedId), [items, page, selectedId]);

  const select = useCallback(
    (id: string, additive = false, region = 0) => {
      if (additive) {
        setMarked((current) => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        return;
      }
      setMarked(new Set());
      setSelectedId(id);
      setRegionIndex(region);
      const item = items.find((candidate) => candidate.id === id);
      const target = item?.regions[region]?.pageNumber;
      if (target) setPage(target);
    },
    [items],
  );

  const apply = useCallback(
    async (operation: ReviewOperation) => {
      setBusy(true);
      setError(null);
      try {
        const { changed, deletedIds } = await scanApi.review(runId, operation);
        setItems((current) => mergeItems(current, changed, deletedIds));
        if (operation.type === "addItem") {
          const created = changed.find((item) => item.origin === "MANUAL" && !items.some((i) => i.id === item.id));
          if (created) setSelectedId(created.id);
        }
        if (operation.type === "merge") setMarked(new Set());
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : String(problem));
      } finally {
        setBusy(false);
      }
    },
    [items, runId],
  );

  const reprocess = useCallback(
    async (what: "ai" | "math") => {
      if (!selectedId) return;
      setBusy(true);
      setError(null);
      try {
        const { item } = await scanApi.reprocess(runId, selectedId, what);
        setItems((current) => mergeItems(current, [item], []));
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : String(problem));
      } finally {
        setBusy(false);
      }
    },
    [runId, selectedId],
  );

  const approve = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await scanApi.approve(runId, destination || null, includeSuggested);
      setApproval(result);
      const full = await scanApi.get(runId, true);
      setRun(full.run);
      setItems(full.items);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  }, [destination, includeSuggested, runId]);

  const control = useCallback(
    async (action: "cancel" | "resume") => {
      setError(null);
      try {
        if (action === "cancel") await scanApi.cancel(runId);
        else await scanApi.resume(runId);
        const { run: next } = await scanApi.get(runId, false);
        setRun(next);
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : String(problem));
      }
    },
    [runId],
  );

  // Atalhos: A aceita, X rejeita, J/K andam pelo que falta decidir.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (!selected || busy || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "a") void apply({ type: "accept", itemIds: [selected.id] });
      else if (key === "x") void apply({ type: "reject", itemIds: [selected.id] });
      else if (key === "j" || key === "k") {
        const rows = flattenTree(items).map((row) => row.item);
        const index = rows.findIndex((item) => item.id === selected.id);
        const step = key === "j" ? 1 : -1;
        for (let i = index + step; i >= 0 && i < rows.length; i += step) {
          const candidate = rows[i];
          if (candidate && !candidate.documentNodeId && candidate.reviewState !== "APPROVED" && candidate.reviewState !== "REJECTED") {
            select(candidate.id);
            break;
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [apply, busy, items, select, selected]);

  const progress = run.pageTo > 0 ? Math.round(((run.lastPageRead - run.pageFrom + 1) / (run.pageTo - run.pageFrom + 1)) * 100) : 0;
  const pendingApproval = counts.accepted + (includeSuggested ? counts.suggested : 0);

  return (
    <div className="lbb-scan-ws">
      <div className="lbb-scan-ws-top">
        <Badge tone={run.state === "FAILED" ? "danger" : inProgress ? "info" : run.state === "APPROVED" ? "ok" : "accent"}>
          {run.interrupted ? "interrompida" : run.stateLabel}
        </Badge>
        <span style={{ color: "var(--text-secondary)" }}>
          {profileLabel} · páginas {run.pageFrom}–{run.pageTo || "?"}
          {run.pageOffset !== null ? ` · impressa = PDF − ${run.pageOffset}` : ""}
        </span>
        {inProgress && (
          <>
            <div className="lbb-scan-progress" aria-label={`Progresso ${progress}%`}>
              <span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
            </div>
            <span>
              {run.lastPageRead} / {run.pageTo || "?"}
            </span>
          </>
        )}
        {inProgress && !run.interrupted && (
          <Button size="sm" variant="ghost" onClick={() => void control("cancel")}>
            Cancelar
          </Button>
        )}
        {(run.interrupted || run.state === "FAILED" || run.state === "CANCELLED") && (
          <Button size="sm" variant="primary" onClick={() => void control("resume")}>
            Retomar da página {run.lastPageRead + 1}
          </Button>
        )}
        {run.metrics && (
          <span style={{ color: "var(--text-muted)", fontSize: "var(--text-meta)" }}>
            {run.metrics.items} itens · {run.metrics.regions} âncoras · {run.metrics.multiPage} atravessam página ·{" "}
            {run.aiCalls} chamadas à IA · {run.mathCalls} reconhecimentos
          </span>
        )}
        <span className="grow" />
        {!inProgress && items.length > 0 && (
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || counts.suggested === 0}
              onClick={() => void apply({ type: "acceptSuggested" })}
            >
              Aceitar sugeridos ({counts.suggested})
            </Button>
            <Select size="sm" value={destination} aria-label="Destino da aprovação" onChange={(event) => setDestination(event.target.value)}>
              <option value="">Raiz do livro</option>
              {destinations.map((node) => (
                <option key={node.id} value={node.id}>
                  {"  ".repeat(node.depth)}
                  {node.title}
                </option>
              ))}
            </Select>
            <Checkbox label="incluir sugeridos" checked={includeSuggested} onChange={(event) => setIncludeSuggested(event.target.checked)} />
            <Button size="sm" variant="primary" icon="check" loading={busy} disabled={pendingApproval === 0} onClick={() => void approve()}>
              Aprovar {pendingApproval}
            </Button>
          </>
        )}
      </div>

      {run.error && (
        <Banner tone="danger" title="A execução falhou">
          {run.error}. As páginas já lidas estão guardadas; retomar continua de onde parou.
        </Banner>
      )}
      {run.warnings.length > 0 && (
        <Banner tone="warn" title="Avisos da execução">
          {run.warnings.slice(0, 4).join(" · ")}
          {run.warnings.length > 4 ? ` · e mais ${run.warnings.length - 4}` : ""}
        </Banner>
      )}
      {error && (
        <Banner tone="danger" onDismiss={() => setError(null)}>
          {error}
        </Banner>
      )}
      {approval && (
        <Banner tone="ok" title="Aprovado" onDismiss={() => setApproval(null)}
          actions={
            <Button size="sm" variant="secondary" href={`/publications/${publicationId}/editor`}>
              Abrir o livro no editor
            </Button>
          }
        >
          {approval.summary.createdNodes} nós criados ({approval.summary.createdQuestions} questões a revisar),{" "}
          {approval.summary.reusedNodes} reaproveitados, {approval.summary.bodyAppends} trechos de teoria,{" "}
          {approval.summary.alreadyInCollection} já estavam no acervo, {approval.summary.anchors} âncoras.
          {approval.skipped.length > 0 && ` ${approval.skipped.length} ficaram de fora: ${[...new Set(approval.skipped.map((s) => s.reason))].join("; ")}.`}
        </Banner>
      )}

      <div className="lbb-scan-ws-grid">
        <section className="lbb-scan-ws-col" aria-label="Estrutura">
          <div className="lbb-scan-ws-colhead">
            <strong>Estrutura</strong>
            <span>
              {counts.needsReview} a revisar · {counts.suggested} sugeridos · {counts.accepted} aceitos · {counts.inCollection} no acervo
            </span>
          </div>
          <div className="lbb-scan-ws-colhead">
            <Segmented
              options={FILTERS.map((id) => ({ id, label: FILTER_LABELS[id] }))}
              value={filter}
              onChange={(id) => setFilter(id as ViewFilter)}
            />
          </div>
          {inProgress && items.length === 0 ? (
            <div className="lbb-scan-ws-empty">A proposta aparece aqui quando a execução terminar. Pode fechar a aba: o scan continua.</div>
          ) : items.length === 0 ? (
            <div className="lbb-scan-ws-empty">Nenhum item foi proposto. Confira o perfil escolhido ou marque itens à mão no PDF.</div>
          ) : (
            <StructureTree items={visible} selectedId={selectedId} marked={marked} onSelect={(id, additive) => select(id, additive)} />
          )}
        </section>

        <section className="lbb-scan-ws-col" aria-label="PDF">
          <div className="lbb-scan-ws-regions">
            {selected && selected.regions.length > 1 && (
              <>
                <Button size="sm" variant="ghost" onClick={() => select(selected.id, false, cycleRegion(selected.regions.length, regionIndex, -1))}>
                  ◀
                </Button>
                <span>
                  Âncora {regionIndex + 1} de {selected.regions.length}
                </span>
                <Button size="sm" variant="ghost" onClick={() => select(selected.id, false, cycleRegion(selected.regions.length, regionIndex, 1))}>
                  ▶
                </Button>
              </>
            )}
            <span style={{ flex: 1 }} />
            <Select size="sm" value={newKind} aria-label="Tipo do item novo" onChange={(event) => setNewKind(event.target.value as ScanKind)}>
              {kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </Select>
            <Button size="sm" variant={drawing === "item" ? "primary" : "secondary"} disabled={busy || inProgress} onClick={() => setDrawing((d) => (d === "item" ? null : "item"))}>
              {drawing === "item" ? "Desenhe o item no PDF…" : "Marcar item novo"}
            </Button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <SourcePdfViewer
              fileUrl={fileUrl}
              pageNumber={page}
              onPageChange={setPage}
              overlays={overlays}
              onSelect={(id, region) => select(id, false, region)}
              editable={selected && !selected.documentNodeId ? { id: selected.id, regionIndex } : null}
              onResize={(id, index, box) => void apply({ type: "resizeRegion", itemId: id, regionIndex: index, box })}
              drawing={drawing !== null}
              onDraw={(pageNumber, box) => {
                const mode = drawing;
                setDrawing(null);
                if (mode === "region" && selected) {
                  void apply({ type: "addRegion", itemId: selected.id, region: { pageNumber, box, role: "CONTINUATION" } });
                } else if (mode === "item") {
                  const parent = selected ? (items.find((i) => i.key === selected.parentKey) ?? null) : null;
                  void apply({
                    type: "addItem",
                    kind: newKind,
                    parentId: parent?.id ?? null,
                    afterId: selected?.id ?? null,
                    region: { pageNumber, box, role: "PRIMARY" },
                  });
                }
              }}
            />
          </div>
        </section>

        <section className="lbb-scan-ws-col" aria-label="Propriedades">
          {selected ? (
            <ScanPropertiesPanel
              item={selected}
              items={items}
              kinds={kinds}
              regionIndex={regionIndex}
              marked={marked}
              drawing={drawing === "region"}
              busy={busy}
              publicationId={publicationId}
              aiAvailable={aiAvailable}
              mathAvailable={mathAvailable}
              onRegion={(index) => select(selected.id, false, index)}
              onOperation={(operation) => void apply(operation)}
              onReprocess={(what) => void reprocess(what)}
              onToggleDraw={() => setDrawing((d) => (d === "region" ? null : "region"))}
            />
          ) : (
            <div className="lbb-scan-ws-empty">Escolha um item na estrutura ou clique numa marca do PDF.</div>
          )}
        </section>
      </div>
    </div>
  );
}

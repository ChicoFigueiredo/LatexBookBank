"use client";

import { useState } from "react";

import { Badge, Banner, Button, Field, Input, Select, injectCss } from "@/design-system";
import { ANCHOR_ROLES, type AnchorRole } from "@modules/assets/domain/node-anchors";
import { PreviewPane } from "@modules/preview/ui/PreviewPane";
import type { ScanKind } from "@modules/scan/domain/proposal";
import type { ReviewOperation } from "@modules/scan/domain/review";
import { effectiveLatex, effectiveText, type ScanItem } from "@modules/scan/domain/scan-item";
import { KIND_LABELS, rowLabel, STATE_LABELS } from "@modules/scan/domain/workspace-view";

/**
 * As propriedades do item escolhido (§34, área da direita) e as operações de revisão (§36).
 *
 * Cada gesto é uma operação para o servidor; a tela não decide se ela vale — o domínio decide, e a
 * recusa volta como mensagem. Texto e LaTeX editados ficam ao lado do original, que continua
 * visível e restaurável (§44).
 */

const CSS = `
.lbb-scan-props{display:flex;flex-direction:column;gap:var(--space-3);padding:var(--space-3);overflow:auto;min-height:0;font-size:var(--text-body-sm)}
.lbb-scan-props h3{margin:0;font-size:var(--text-card-title)}
.lbb-scan-props-row{display:flex;gap:var(--space-2);flex-wrap:wrap;align-items:center}
.lbb-scan-props-section{display:flex;flex-direction:column;gap:var(--space-2);border-top:1px solid var(--border-subtle);padding-top:var(--space-3)}
.lbb-scan-props-section > strong{font-size:var(--text-meta);text-transform:uppercase;letter-spacing:var(--tracking-wide);color:var(--text-muted)}
.lbb-scan-props textarea{width:100%;min-height:96px;font-family:var(--font-mono);font-size:12px;padding:var(--space-2);border:1px solid var(--border-default);border-radius:var(--radius-sm);background:var(--surface);color:var(--text-primary);resize:vertical}
.lbb-scan-props ul{margin:0;padding-left:var(--space-4);color:var(--text-secondary)}
.lbb-scan-region{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:var(--radius-sm);border:1px solid var(--border-subtle)}
.lbb-scan-region[data-current="true"]{border-color:var(--danger);background:var(--selection)}
.lbb-scan-region button.link{all:unset;cursor:pointer;flex:1;min-width:120px;white-space:nowrap;font-family:var(--font-mono);font-size:11px}
.lbb-scan-region select{width:auto;flex:none}
.lbb-scan-preview{height:220px;border:1px solid var(--border-subtle);border-radius:var(--radius-sm);overflow:hidden}
.lbb-scan-original{white-space:pre-wrap;font-family:var(--font-mono);font-size:11px;color:var(--text-muted);max-height:120px;overflow:auto;background:var(--surface-sunken);padding:var(--space-2);border-radius:var(--radius-sm)}
`;

const ROLE_LABELS: Readonly<Record<AnchorRole, string>> = {
  PRIMARY: "principal",
  CONTINUATION: "continuação",
  ILLUSTRATION: "ilustração",
  ANSWER: "resposta",
  SOLUTION: "resolução",
  FOOTNOTE: "nota de rodapé",
};

export interface ScanPropertiesPanelProps {
  readonly item: ScanItem;
  readonly items: readonly ScanItem[];
  readonly kinds: readonly ScanKind[];
  readonly regionIndex: number;
  readonly marked: ReadonlySet<string>;
  readonly drawing: boolean;
  readonly busy: boolean;
  readonly publicationId: string;
  readonly aiAvailable: boolean;
  readonly mathAvailable: boolean;
  readonly onRegion: (index: number) => void;
  readonly onOperation: (operation: ReviewOperation) => void;
  readonly onReprocess: (what: "ai" | "math") => void;
  readonly onToggleDraw: () => void;
}

export function ScanPropertiesPanel(props: ScanPropertiesPanelProps) {
  injectCss("lbb-scan-props", CSS);
  const { item } = props;
  // O formulário é da versão do item que chegou; trocar de item (ou a versão mudar) recomeça.
  return <PanelBody key={`${item.id}:${item.reviewedText ?? ""}:${item.reviewedLatex ?? ""}:${item.mathResult?.recognizedAt ?? ""}`} {...props} />;
}

function PanelBody({
  item,
  items,
  kinds,
  regionIndex,
  marked,
  drawing,
  busy,
  publicationId,
  aiAvailable,
  mathAvailable,
  onRegion,
  onOperation,
  onReprocess,
  onToggleDraw,
}: ScanPropertiesPanelProps) {
  const [title, setTitle] = useState(item.title ?? "");
  const [label, setLabel] = useState(item.originalLabel ?? "");
  const [text, setText] = useState(effectiveText(item));
  const [latex, setLatex] = useState(effectiveLatex(item) ?? "");

  const locked = item.documentNodeId !== null;
  const parents = items.filter((candidate) => candidate.id !== item.id && candidate.kind !== "CONTENT");
  const parent = items.find((candidate) => candidate.key === item.parentKey) ?? null;
  const markedIds = [...marked].filter((id) => id !== item.id);
  const parts = Object.entries(item.confidenceParts);

  return (
    <div className="lbb-scan-props" aria-label="Propriedades do item">
      <div>
        <div className="lbb-scan-props-row">
          <Badge tone="accent">{KIND_LABELS[item.kind]}</Badge>
          {locked ? <Badge tone="ok">no acervo</Badge> : <Badge tone="neutral">{STATE_LABELS[item.reviewState]}</Badge>}
          <Badge tone={item.confidence < 0.7 ? "warn" : "neutral"}>confiança {Math.round(item.confidence * 100)}%</Badge>
          {item.origin !== "SCAN" && <Badge tone="warm">{item.origin.toLowerCase()}</Badge>}
        </div>
        <h3 style={{ marginTop: 8 }}>{rowLabel(item)}</h3>
        <span style={{ color: "var(--text-muted)" }}>
          página {item.pageNumber}
          {item.printedPage ? ` (impressa ${item.printedPage})` : ""}
        </span>
      </div>

      {locked && (
        <Banner
          tone="ok"
          title="Já está no acervo"
          actions={
            <Button size="sm" variant="secondary" href={`/publications/${publicationId}/editor?node=${item.documentNodeId}`}>
              Abrir no editor
            </Button>
          }
        >
          A partir daqui, a correção é no editor — lá o PDF fica ao lado, com as mesmas âncoras.
        </Banner>
      )}

      <div className="lbb-scan-props-row">
        <Button size="sm" variant="primary" icon="check" disabled={locked || busy || item.reviewState === "APPROVED"} onClick={() => onOperation({ type: "accept", itemIds: [item.id] })}>
          Aceitar
        </Button>
        <Button size="sm" variant="danger" icon="x" disabled={locked || busy || item.reviewState === "REJECTED"} onClick={() => onOperation({ type: "reject", itemIds: [item.id] })}>
          Rejeitar
        </Button>
        {(item.reviewState === "APPROVED" || item.reviewState === "REJECTED") && !locked && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onOperation({ type: "reopen", itemIds: [item.id] })}>
            Reabrir
          </Button>
        )}
      </div>

      <div className="lbb-scan-props-section">
        <strong>Estrutura</strong>
        <Field label="Tipo">
          <Select
            value={item.kind}
            disabled={locked || busy}
            onChange={(event) => onOperation({ type: "setKind", itemId: item.id, kind: event.target.value })}
          >
            {kinds.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="lbb-scan-props-row">
          <Field label="Rótulo impresso">
            <Input
              value={label}
              disabled={locked || busy}
              onChange={(event) => setLabel(event.target.value)}
              onBlur={() => label !== (item.originalLabel ?? "") && onOperation({ type: "setLabel", itemId: item.id, label })}
            />
          </Field>
          <Field label="Título">
            <Input
              value={title}
              disabled={locked || busy}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => title !== (item.title ?? "") && onOperation({ type: "setTitle", itemId: item.id, title })}
            />
          </Field>
        </div>
        <Field label="Dentro de">
          <Select
            value={parent?.id ?? ""}
            disabled={locked || busy}
            onChange={(event) => onOperation({ type: "reparent", itemId: item.id, parentId: event.target.value || null })}
          >
            <option value="">(raiz do livro)</option>
            {parents.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {KIND_LABELS[candidate.kind]} · {rowLabel(candidate)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="lbb-scan-props-row">
          <Button size="sm" variant="secondary" disabled={locked || busy || !parent} onClick={() => onOperation({ type: "promote", itemId: item.id })}>
            Promover
          </Button>
          <Button size="sm" variant="secondary" disabled={locked || busy} onClick={() => onOperation({ type: "demote", itemId: item.id })}>
            Rebaixar
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={locked || busy || markedIds.length === 0}
            title="Ctrl/⌘ + clique na árvore marca os itens a unir"
            onClick={() => onOperation({ type: "merge", itemIds: [item.id, ...markedIds] })}
          >
            Unir com {markedIds.length} marcado(s)
          </Button>
        </div>
      </div>

      <div className="lbb-scan-props-section">
        <strong>Âncoras no PDF</strong>
        {item.regions.map((region, index) => (
          <div key={index} className="lbb-scan-region" data-current={index === regionIndex}>
            <button type="button" className="link" onClick={() => onRegion(index)}>
              {index + 1}. p. {region.pageNumber} · y {Math.round(region.box.y * 100)}–{Math.round((region.box.y + region.box.height) * 100)}%
            </button>
            <Select
              size="sm"
              value={region.role}
              disabled={locked || busy}
              aria-label="Papel da âncora"
              onChange={(event) => onOperation({ type: "setRegionRole", itemId: item.id, regionIndex: index, role: event.target.value })}
            >
              {ANCHOR_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="ghost" disabled={locked || busy || index === 0} onClick={() => onOperation({ type: "moveRegion", itemId: item.id, from: index, to: index - 1 })}>
              ↑
            </Button>
            <Button size="sm" variant="ghost" disabled={locked || busy || index === item.regions.length - 1} onClick={() => onOperation({ type: "moveRegion", itemId: item.id, from: index, to: index + 1 })}>
              ↓
            </Button>
            {index > 0 && (
              <Button size="sm" variant="ghost" disabled={locked || busy} title="Separar: desta âncora em diante vira outro item" onClick={() => onOperation({ type: "split", itemId: item.id, regionIndex: index })}>
                ✂
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={locked || busy || item.regions.length === 1} aria-label="Retirar âncora" onClick={() => onOperation({ type: "removeRegion", itemId: item.id, regionIndex: index })}>
              ✕
            </Button>
          </div>
        ))}
        <div className="lbb-scan-props-row">
          <Button size="sm" variant={drawing ? "primary" : "secondary"} icon="plus" disabled={locked || busy} onClick={onToggleDraw}>
            {drawing ? "Desenhe no PDF…" : "Acrescentar âncora"}
          </Button>
          <span style={{ color: "var(--text-muted)" }}>Arraste as alças da âncora marcada para ajustar.</span>
        </div>
      </div>

      {item.diagnostic && (
        <div className="lbb-scan-props-section">
          <strong>Diagnóstico</strong>
          <Badge tone={item.diagnostic.status === "complete" ? "ok" : "warn"}>{item.diagnostic.status}</Badge>
          {item.diagnostic.reasons.length > 0 && (
            <ul>
              {item.diagnostic.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="lbb-scan-props-section">
        <strong>Texto</strong>
        <textarea value={text} disabled={locked || busy} onChange={(event) => setText(event.target.value)} aria-label="Texto do item" />
        <div className="lbb-scan-props-row">
          <Button size="sm" variant="secondary" disabled={locked || busy || text === effectiveText(item)} onClick={() => onOperation({ type: "editText", itemId: item.id, text })}>
            Guardar texto
          </Button>
          {item.reviewedText !== null && (
            <Button size="sm" variant="ghost" disabled={locked || busy} onClick={() => onOperation({ type: "editText", itemId: item.id, text: null })}>
              Voltar ao lido
            </Button>
          )}
        </div>
        {item.reviewedText !== null && <div className="lbb-scan-original">{item.text}</div>}
      </div>

      <div className="lbb-scan-props-section">
        <strong>LaTeX</strong>
        {item.mathResult && (
          <span style={{ color: "var(--text-muted)" }}>
            reconhecido por {item.mathResult.model} ({item.mathResult.providerId})
            {item.mathResult.confidence !== null ? ` · confiança ${Math.round(item.mathResult.confidence * 100)}%` : ""} ·{" "}
            {item.mathResult.durationMs} ms
          </span>
        )}
        {item.needsMath && !item.mathResult && item.reviewedLatex === null && (
          <span style={{ color: "var(--warn-text)" }}>Tem matemática que o texto do PDF não representa: reconheça ou escreva.</span>
        )}
        <textarea value={latex} disabled={locked || busy} onChange={(event) => setLatex(event.target.value)} aria-label="LaTeX do item" />
        <div className="lbb-scan-props-row">
          <Button size="sm" variant="secondary" disabled={locked || busy || latex === (effectiveLatex(item) ?? "")} onClick={() => onOperation({ type: "editLatex", itemId: item.id, latex })}>
            Guardar LaTeX
          </Button>
          {item.reviewedLatex !== null && (
            <Button size="sm" variant="ghost" disabled={locked || busy} onClick={() => onOperation({ type: "editLatex", itemId: item.id, latex: null })}>
              Descartar revisão
            </Button>
          )}
          <Button size="sm" variant="secondary" icon="scan-text" disabled={locked || busy || !mathAvailable} title={mathAvailable ? undefined : "Defina AI_VISION_MODEL"} onClick={() => onReprocess("math")}>
            Reprocessar matemática
          </Button>
        </div>
        {latex.trim() !== "" && (
          <div className="lbb-scan-preview">
            <PreviewPane source={{ statementLatex: latex, solutionLatex: "", complementLatex: "", options: [] }} />
          </div>
        )}
      </div>

      <div className="lbb-scan-props-section">
        <strong>Por que o scan propôs</strong>
        <ul>
          {item.evidence.map((reason, index) => (
            <li key={index}>{reason}</li>
          ))}
        </ul>
        {parts.length > 0 && (
          <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
            {parts.map(([name, value]) => `${name} ${Math.round(Number(value) * 100)}`).join(" · ")}
          </span>
        )}
        {item.aiDecision && (
          <span>
            IA ({item.aiDecision.model}): {KIND_LABELS[item.aiDecision.previousKind]} → {KIND_LABELS[item.aiDecision.kind]} — {item.aiDecision.reason}
          </span>
        )}
        {item.proposed.kind !== item.kind && (
          <span style={{ color: "var(--text-muted)" }}>O scan propôs {KIND_LABELS[item.proposed.kind]}.</span>
        )}
        <Button size="sm" variant="secondary" icon="sparkles" disabled={locked || busy || !aiAvailable} title={aiAvailable ? undefined : "Defina AI_BASE_URL e AI_MODEL"} onClick={() => onReprocess("ai")}>
          Perguntar à IA
        </Button>
      </div>
    </div>
  );
}

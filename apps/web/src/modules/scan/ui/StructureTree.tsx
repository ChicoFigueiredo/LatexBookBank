"use client";

import { useEffect, useRef } from "react";

import { injectCss } from "@/design-system";
import type { ScanItem } from "@modules/scan/domain/scan-item";
import {
  flattenTree,
  KIND_LABELS,
  rowLabel,
  STATE_LABELS,
} from "@modules/scan/domain/workspace-view";

/**
 * A estrutura proposta (§34, área da esquerda). Uma linha por item, recuada pela profundidade, com
 * o tipo, a confiança e o estado. Setas navegam; Ctrl/⌘+clique acumula para unir.
 */

const CSS = `
.lbb-scan-tree{display:flex;flex-direction:column;min-height:0;overflow:auto;font-size:var(--text-body-sm)}
.lbb-scan-row{display:flex;align-items:center;gap:6px;padding:3px var(--space-2);cursor:pointer;border-left:3px solid transparent;white-space:nowrap}
.lbb-scan-row:hover{background:var(--hover-overlay)}
.lbb-scan-row[aria-selected="true"]{background:var(--selection);border-left-color:var(--danger)}
.lbb-scan-row[data-marked="true"]{box-shadow:inset 0 0 0 1px var(--accent)}
.lbb-scan-row-label{overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.lbb-scan-row[data-state="REJECTED"] .lbb-scan-row-label{text-decoration:line-through;color:var(--text-disabled)}
.lbb-scan-row-kind{font-family:var(--font-mono);font-size:10px;color:var(--text-muted);min-width:64px}
.lbb-scan-row-conf{font-family:var(--font-mono);font-size:10px;min-width:30px;text-align:right}
.lbb-scan-row-conf[data-low="true"]{color:var(--warn-text);font-weight:var(--weight-bold)}
.lbb-scan-dot{width:8px;height:8px;border-radius:50%;flex:none}
.lbb-scan-dot[data-state="AUTO_ACCEPTABLE"]{background:var(--info)}
.lbb-scan-dot[data-state="NEEDS_REVIEW"]{background:var(--warn)}
.lbb-scan-dot[data-state="APPROVED"]{background:var(--ok)}
.lbb-scan-dot[data-state="REJECTED"]{background:var(--text-disabled)}
.lbb-scan-dot[data-state="IN_COLLECTION"]{background:var(--ok);box-shadow:0 0 0 2px var(--ok-surface)}
.lbb-scan-chip{font-family:var(--font-mono);font-size:10px;padding:0 4px;border-radius:var(--radius-sm);border:1px solid var(--border-default);color:var(--text-secondary)}
.lbb-scan-chip[data-tone="warn"]{border-color:var(--warn-border);color:var(--warn-text);background:var(--warn-surface)}
`;

export interface StructureTreeProps {
  readonly items: readonly ScanItem[];
  readonly selectedId: string | null;
  readonly marked: ReadonlySet<string>;
  readonly onSelect: (id: string, additive: boolean) => void;
}

export function StructureTree({ items, selectedId, marked, onSelect }: StructureTreeProps) {
  injectCss("lbb-scan-tree", CSS);
  const rows = flattenTree(items);
  const selectedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const move = (step: 1 | -1) => {
    const index = rows.findIndex((row) => row.item.id === selectedId);
    const next = rows[Math.min(rows.length - 1, Math.max(0, index + step))];
    if (next) onSelect(next.item.id, false);
  };

  return (
    <div
      className="lbb-scan-tree"
      role="tree"
      aria-label="Estrutura proposta"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          move(1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          move(-1);
        }
      }}
    >
      {rows.map(({ item, depth }) => {
        const selected = item.id === selectedId;
        const low = item.confidence < 0.7;
        return (
          <div
            key={item.id}
            ref={selected ? selectedRef : undefined}
            role="treeitem"
            aria-selected={selected}
            aria-level={depth + 1}
            data-state={item.reviewState}
            data-marked={marked.has(item.id)}
            data-testid="scan-tree-row"
            className="lbb-scan-row"
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={(event) => onSelect(item.id, event.ctrlKey || event.metaKey)}
          >
            <span className="lbb-scan-row-kind">{KIND_LABELS[item.kind]}</span>
            <span className="lbb-scan-row-label" title={item.text}>
              {rowLabel(item)}
            </span>
            {item.regions.length > 1 && (
              <span className="lbb-scan-chip" title={`${item.regions.length} âncoras`}>
                ×{item.regions.length}
              </span>
            )}
            {item.diagnostic && item.diagnostic.status !== "complete" && (
              <span className="lbb-scan-chip" data-tone="warn" title={item.diagnostic.reasons.join("; ")}>
                !
              </span>
            )}
            <span
              className="lbb-scan-dot"
              data-state={item.documentNodeId ? "IN_COLLECTION" : item.reviewState}
              title={item.documentNodeId ? "no acervo" : STATE_LABELS[item.reviewState]}
            />
            <span className="lbb-scan-row-conf" data-low={low}>
              {Math.round(item.confidence * 100)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

"use client";

import type { ProposalMetrics } from "@modules/scan/domain/proposal";
import type { ReviewOperation } from "@modules/scan/domain/review";
import type { ScanItem } from "@modules/scan/domain/scan-item";
import type { ScanRunState, ScanSettings } from "@modules/scan/domain/scan-run";

/** O que as rotas do scan devolvem, do jeito que a tela lê. */

export interface ScanRunView {
  readonly id: string;
  readonly publicationId: string;
  readonly sourceAssetId: string;
  readonly profileId: string;
  readonly profileVersion: number;
  readonly engineVersion: string;
  readonly settings: ScanSettings;
  readonly state: ScanRunState;
  readonly stateLabel: string;
  readonly pageFrom: number;
  readonly pageTo: number;
  readonly lastPageRead: number;
  readonly stepDone: number;
  readonly stepTotal: number;
  readonly aiProviderId: string | null;
  readonly aiModel: string | null;
  readonly mathProviderId: string | null;
  readonly mathModel: string | null;
  readonly aiCalls: number;
  readonly mathCalls: number;
  readonly metrics: ProposalMetrics | null;
  readonly warnings: readonly string[];
  readonly pageOffset: number | null;
  readonly error: string | null;
  readonly running: boolean;
  readonly interrupted: boolean;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly createdAt: string;
}

export interface ApprovalResult {
  readonly summary: {
    readonly createdNodes: number;
    readonly createdQuestions: number;
    readonly reusedNodes: number;
    readonly bodyAppends: number;
    readonly anchors: number;
    readonly alreadyInCollection: number;
    readonly materializedItems: number;
  };
  readonly skipped: readonly { readonly itemId: string; readonly reason: string }[];
}

export class ScanRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ScanRequestError";
  }
}

async function send<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    ...(init?.body ? { headers: { "content-type": "application/json" } } : {}),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new ScanRequestError(String(payload["message"] ?? `Falha (HTTP ${response.status}).`), response.status);
  }
  return payload as T;
}

export const scanApi = {
  get: (runId: string, withItems: boolean) =>
    send<{ run: ScanRunView; items: ScanItem[] }>(`/api/scans/${runId}${withItems ? "" : "?items=0"}`),
  cancel: (runId: string) => send<unknown>(`/api/scans/${runId}/cancel`, { method: "POST" }),
  resume: (runId: string) => send<unknown>(`/api/scans/${runId}/resume`, { method: "POST" }),
  review: (runId: string, operation: ReviewOperation) =>
    send<{ changed: ScanItem[]; deletedIds: string[] }>(`/api/scans/${runId}/items`, {
      method: "PATCH",
      body: JSON.stringify(operation),
    }),
  reprocess: (runId: string, itemId: string, what: "ai" | "math") =>
    send<{ item: ScanItem }>(`/api/scans/${runId}/items/${itemId}/reprocess`, {
      method: "POST",
      body: JSON.stringify({ what }),
    }),
  approve: (runId: string, destinationId: string | null, includeSuggested: boolean) =>
    send<ApprovalResult>(`/api/scans/${runId}/approve`, {
      method: "POST",
      body: JSON.stringify({ destinationId, includeSuggested }),
    }),
  start: (publicationId: string, body: Record<string, unknown>) =>
    send<{ run: ScanRunView; reused: boolean }>(`/api/publications/${publicationId}/scans`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

/** Aplica a resposta de uma operação sobre a lista que a tela tem. */
export function mergeItems(
  current: readonly ScanItem[],
  changed: readonly ScanItem[],
  deletedIds: readonly string[],
): ScanItem[] {
  const removed = new Set(deletedIds);
  const byId = new Map(changed.map((item) => [item.id, item]));
  const kept = current.filter((item) => !removed.has(item.id)).map((item) => byId.get(item.id) ?? item);
  const known = new Set(current.map((item) => item.id));
  const added = changed.filter((item) => !known.has(item.id));
  return [...kept, ...added].sort((a, b) => a.sortOrder - b.sortOrder);
}

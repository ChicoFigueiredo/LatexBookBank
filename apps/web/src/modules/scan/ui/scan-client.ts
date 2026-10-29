"use client";

import type { ScanRunDto } from "@modules/scan/application/scan-run-dto";
import type { ReviewOperation } from "@modules/scan/domain/review";
import type { ScanItem } from "@modules/scan/domain/scan-item";

/** O que as rotas do scan devolvem, do jeito que a tela lê. */

/**
 * A execução, como a rota a manda. Era redeclarada aqui campo a campo, e o `tsc` não ligava a
 * cópia ao `scanRunDto` da rota (ARQ-10 da revisão de 2026-09-23): agora é o mesmo tipo.
 */
export type ScanRunView = ScanRunDto;

/** O palpite de perfil, lido das primeiras páginas do PDF (ADR 0007). */
export interface ProfileSuggestionView {
  readonly ranking: readonly {
    readonly id: string;
    readonly label: string;
    readonly documentKind: "BOOK" | "EXAM";
    readonly score: number;
    readonly evidence: string;
  }[];
  readonly sampledPages: number;
}

/** A conferência antes de apagar uma importação (D57): os números e quem fica, com o motivo. */
export interface ImportPreview {
  readonly runId: string;
  readonly created: number;
  readonly trash: readonly string[];
  readonly counts: Readonly<Record<string, number>>;
  /** As figuras que vão junto com os corpos — a figura do scan não é nó (ADR 0005). */
  readonly figures: number;
  readonly keptCount: number;
  readonly keptRows: readonly { readonly id: string; readonly label: string; readonly reason: string }[];
  /** Nós que já existiam e perdem o texto que a varredura lhes acrescentou. */
  readonly detached: number;
}

export interface RemovalResult {
  readonly scope: "proposal" | "import";
  readonly trashed: number;
  readonly kept: number;
  readonly counts: Readonly<Record<string, number>>;
  readonly figures: number;
  readonly detached: number;
}

export interface ApprovalResult {
  readonly summary: {
    readonly createdNodes: number;
    readonly createdQuestions: number;
    readonly reusedNodes: number;
    readonly bodyAppends: number;
    readonly statementAppends: number;
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
  reprocess: (runId: string, itemId: string, what: "ai" | "math" | "figure") =>
    send<{ item: ScanItem }>(`/api/scans/${runId}/items/${itemId}/reprocess`, {
      method: "POST",
      body: JSON.stringify({ what }),
    }),
  approve: (runId: string, destinationId: string | null, includeSuggested: boolean) =>
    send<ApprovalResult>(`/api/scans/${runId}/approve`, {
      method: "POST",
      body: JSON.stringify({ destinationId, includeSuggested }),
    }),
  importPreview: (runId: string) => send<ImportPreview>(`/api/scans/${runId}/import`),
  removeImport: (runId: string, scope: "proposal" | "import") =>
    send<RemovalResult>(`/api/scans/${runId}/import?scope=${scope}`, { method: "DELETE" }),
  start: (publicationId: string, body: Record<string, unknown>) =>
    send<{ run: ScanRunView; reused: boolean }>(`/api/publications/${publicationId}/scans`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  switchProfile: (runId: string, profileId: string) =>
    send<{ run: ScanRunView }>(`/api/scans/${runId}/switch-profile`, {
      method: "POST",
      body: JSON.stringify({ profileId }),
    }),
  suggestProfile: (publicationId: string) =>
    send<ProfileSuggestionView>(`/api/publications/${publicationId}/capture-profile-suggestion`),
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

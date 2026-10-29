"use client";

import type {
  ImportPreviewResponse,
  ImportRemovalResponse,
  ProfileSuggestionResponse,
  ScanApprovalResponse,
} from "@modules/scan/application/scan-contract";
import type { ScanRunDto } from "@modules/scan/application/scan-run-dto";
import type { ReviewOperation } from "@modules/scan/domain/review";
import type { ScanItem } from "@modules/scan/domain/scan-item";
import { ApiError, readLenientReply } from "@/shared/http/api-client";

/** O que as rotas do scan devolvem, do jeito que a tela lê. */

/**
 * A execução, como a rota a manda. Era redeclarada aqui campo a campo, e o `tsc` não ligava a
 * cópia ao `scanRunDto` da rota (ARQ-10 da revisão de 2026-09-23): agora é o mesmo tipo.
 */
export type ScanRunView = ScanRunDto;

/**
 * O palpite, a conferência, a remoção e a aprovação: os tipos do contrato do scan, que as rotas
 * anotam com `satisfies` (ADR 0010). Os nomes daqui são os que as telas já usavam.
 */
export type ProfileSuggestionView = ProfileSuggestionResponse;
export type ImportPreview = ImportPreviewResponse;
export type RemovalResult = ImportRemovalResponse;
export type ApprovalResult = ScanApprovalResponse;

/**
 * A requisição, com a recusa como `ApiError` — a mensagem da rota, ou "Falha (HTTP n)." quando
 * ela não mandou nenhuma. Um corpo que não é JSON não vira erro de leitura: a recusa continua
 * dizendo o status, e só a rede fora sobe como o erro do `fetch`.
 */
async function send<T>(url: string, init?: RequestInit): Promise<T> {
  const reply = await readLenientReply<T>(url, {
    ...init,
    ...(init?.body ? { headers: { "content-type": "application/json" } } : {}),
  });
  if (!reply.ok) throw new ApiError(reply.status, reply.body);
  return reply.body as T;
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

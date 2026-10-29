/**
 * O contrato HTTP das rotas do scan que a tela lê, além da execução (`scan-run-dto.ts`).
 *
 * Só tipos, sem nada de servidor: a rota anota a resposta com eles (`satisfies`) e o cliente
 * (`scan/ui/scan-client.ts`) importa os mesmos (ADR 0010). Eram escritos à mão no cliente, e o
 * `tsc` não os ligava à rota.
 *
 * O contrato diz o que a tela lê: a conferência da remoção leva também os `kept` crus, que a tela
 * não usa e o contrato não promete.
 */

/** `POST /api/scans/:runId/approve`, 200: o que entrou no acervo, e o que ficou de fora e por quê. */
export interface ScanApprovalResponse {
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

/**
 * `GET /api/scans/:runId/import`, 200: a conferência antes de apagar uma importação (D57) — os
 * números e quem fica, com o motivo.
 */
export interface ImportPreviewResponse {
  readonly runId: string;
  readonly created: number;
  readonly trash: readonly string[];
  readonly counts: Readonly<Record<string, number>>;
  /** As figuras que vão junto com os corpos — a figura do scan não é nó (ADR 0005). */
  readonly figures: number;
  readonly keptCount: number;
  readonly keptRows: readonly {
    readonly id: string;
    readonly label: string;
    readonly reason: string;
  }[];
  /** Nós que já existiam e perdem o texto que a varredura lhes acrescentou. */
  readonly detached: number;
}

/** `DELETE /api/scans/:runId/import?scope=…`, 200: o que a remoção fez. */
export interface ImportRemovalResponse {
  readonly scope: "proposal" | "import";
  readonly trashed: number;
  readonly kept: number;
  readonly counts: Readonly<Record<string, number>>;
  readonly figures: number;
  readonly detached: number;
}

/** `GET /api/publications/:id/capture-profile-suggestion`, 200: o palpite de perfil (ADR 0007). */
export interface ProfileSuggestionResponse {
  readonly ranking: readonly {
    readonly id: string;
    readonly label: string;
    readonly documentKind: "BOOK" | "EXAM";
    readonly score: number;
    readonly evidence: string;
  }[];
  readonly sampledPages: number;
}

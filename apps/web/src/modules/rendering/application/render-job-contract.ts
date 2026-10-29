import type { RenderDiagnostic } from "@latexbookbank/render-contract";

import type { RenderSourceSpan } from "../domain/build-render-bundle";
import type { RenderArtifactRecord, RenderJobState } from "../domain/render-job";

/**
 * O contrato HTTP das rotas de render, do jeito que o painel o lê.
 *
 * Só tipos, sem nada de servidor: `renderJobResponse` (`app/api/render-http.ts`) anota a resposta
 * com eles (`satisfies`), e o painel (`RenderOutcomeView`) é escrito a partir deles (ADR 0010).
 * Vale para as duas rotas que compilam — a da questão e a do corpo do nó —, que respondem com a
 * mesma forma.
 */

/** Um arquivo do job, sem a chave de storage: ela é opaca e do servidor. */
export type RenderArtifactDto = Omit<RenderArtifactRecord, "storageKey" | "sha256">;

/**
 * `POST /api/publications/:id/questions/:questionId/render` e
 * `POST /api/publications/:id/nodes/:nodeId/render`, 200: o job compilado, ou o do cache.
 */
export interface RenderJobResponse {
  readonly jobId: string;
  readonly state: RenderJobState;
  readonly success: boolean;
  readonly cacheHit: boolean;
  readonly durationMs: number;
  readonly diagnostics: readonly RenderDiagnostic[];
  /** O log cru, truncado pelo meio. */
  readonly stdout: string;
  /** O corpo que foi realmente enviado ao worker, e não uma reconstrução do cliente. */
  readonly sourceLatex: string;
  /** Onde, nos campos do editor, cada linha do corpo nasceu. */
  readonly sourceMap: readonly RenderSourceSpan[];
  readonly artifacts: readonly RenderArtifactDto[];
}

import type { QuestionMetadata } from "@modules/questions/domain/question-metadata";
import type { RevisionSnapshot } from "@modules/questions/domain/revision-diff";

/**
 * O contrato HTTP das rotas da questão que o editor usa, do jeito que a tela o lê.
 *
 * Só tipos, sem nada de servidor: a rota anota a resposta com eles (`satisfies`) e o cliente
 * (`questions/ui/question-client.ts`) importa os mesmos (ARQ-10 da revisão de 2026-09-23).
 */

/**
 * Os metadados como a rota os manda: a dificuldade é o número da coluna, sem passar pelo domínio.
 *
 * O domínio diz `Difficulty` (0, 2, 5, 7 ou 10), e a tela sempre leu assim; a rota devolve o
 * inteiro gravado. O que a tela grava passa por `normalizeMetadata`, mas um valor de fora da
 * escala que chegasse ao banco por outro caminho chegaria ao `MetadataPanel` sem aviso. O contrato
 * registra a forma real; quem estreita é o cliente, num lugar só.
 */
export type QuestionMetadataDto = Omit<QuestionMetadata, "difficulty"> & {
  readonly difficulty: number;
};

/** `GET /api/publications/:id/questions/:questionId`, 200. */
export interface QuestionDetailResponse {
  readonly version: string;
  readonly metadata: QuestionMetadataDto;
}

/** `PATCH /api/publications/:id/questions/:questionId`, 200. */
export interface SaveQuestionResponse {
  readonly id: string;
  /** O token de concorrência novo: vai no `expectedVersion` da próxima gravação. */
  readonly version: string;
  /** Se houve escrita. Um `PATCH` sem mudança responde `false` e não move a versão. */
  readonly written: boolean;
}

/** `PATCH …`, 409: alguém gravou antes. Os dois lados, para quem quiser comparar. */
export interface SaveQuestionConflict {
  readonly error: "conflict";
  readonly message: string;
  readonly expectedVersion: string;
  readonly actualVersion: string;
}

/** Uma linha da timeline do histórico, sem o snapshot. */
export interface RevisionRowDto {
  readonly revisionNumber: number;
  readonly origin: string;
  readonly summary: string;
  /** ISO-8601. */
  readonly createdAt: string;
}

/** `GET /api/questions/:questionId/revisions`, 200. */
export interface RevisionListResponse {
  readonly revisions: readonly RevisionRowDto[];
}

/** `GET /api/questions/:questionId/revisions?revision=N`, 200: a revisão e o estado atual. */
export interface RevisionDetailResponse extends RevisionRowDto {
  readonly snapshot: RevisionSnapshot;
  /** `null` quando a questão deixou de existir. */
  readonly current: RevisionSnapshot | null;
}

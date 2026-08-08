import type { RenderDiagnostic } from "@latexbookbank/render-contract";

/**
 * O registro de uma compilação, do ponto de vista da aplicação.
 *
 * O worker não sabe que isto existe — ele compila e esquece (D35). Quem guarda é este lado, e é
 * por isso que o worker roda sem banco.
 */

export const RENDER_JOB_STATES = ["QUEUED", "RUNNING", "DONE", "FAILED", "CANCELLED"] as const;
export type RenderJobState = (typeof RENDER_JOB_STATES)[number];

export interface RenderArtifactRecord {
  readonly kind: "RENDER_PDF" | "RENDER_PNG";
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly width: number | null;
  readonly height: number | null;
  /** Nome dentro do job — `main.pdf`, `page-1.png`. Preserva a ordem das páginas. */
  readonly name: string;
}

export interface RenderJobRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly questionId: string | null;
  readonly contentHash: string;
  readonly profileId: string;
  readonly rendererVersion: string;
  readonly state: RenderJobState;
  readonly success: boolean;
  readonly durationMs: number;
  readonly diagnostics: readonly RenderDiagnostic[];
  readonly stdout: string;
  readonly stderr: string;
  readonly artifacts: readonly RenderArtifactRecord[];
}

/** O que se grava; o `id` e a data vêm do banco. */
export type NewRenderJob = Omit<RenderJobRecord, "id">;

export interface RenderJobRepository {
  /**
   * Procura uma compilação anterior com a mesma entrada.
   *
   * Por `workspaceId` **e** hash: o hash já é global por construção, mas isolar por workspace é o
   * que impede um artefato de uma biblioteca aparecer em outra por coincidência de conteúdo — e
   * "coincidência de conteúdo" entre duas bibliotecas do mesmo dono é o caso comum, não o raro.
   */
  findByContentHash(workspaceId: string, contentHash: string): Promise<RenderJobRecord | null>;

  create(job: NewRenderJob): Promise<RenderJobRecord>;
}

/**
 * Limite do log guardado.
 *
 * O log do `pgfplots` passa de 1 MB, e guardar isso inteiro por job encheria o banco com texto
 * que ninguém lê duas vezes. 128 KB cobre o log de um documento normal por completo.
 */
export const MAX_LOG_CHARS = 128 * 1024;

/**
 * Corta o log pelo **meio**, não pelo fim.
 *
 * O começo tem a versão do TeX e os pacotes carregados; o fim tem o resumo e o erro fatal. O que
 * sobra no meio é a lista de fontes e caixas. Cortar só o fim perderia justamente a linha que
 * explica a falha.
 */
export function truncateLog(log: string): string {
  if (log.length <= MAX_LOG_CHARS) return log;

  const half = Math.floor(MAX_LOG_CHARS / 2);
  const removed = log.length - MAX_LOG_CHARS;

  return (
    log.slice(0, half) +
    `\n\n[… ${removed} caracteres omitidos pelo LatexBookBank …]\n\n` +
    log.slice(log.length - half)
  );
}

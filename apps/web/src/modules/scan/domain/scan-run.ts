/**
 * A execução do scan (§39, §47–§49 do prompt 03, D49, D53).
 *
 * Uma varredura longa é uma sequência de estados gravados, não uma requisição: fechar a aba não a
 * interrompe, reiniciar o servidor a deixa parada no último ponto gravado, e cancelar é um estado
 * — o que já foi lido fica.
 */

export const SCAN_RUN_STATES = [
  "QUEUED",
  "EXTRACTING",
  "ANALYZING_LAYOUT",
  "STRUCTURING",
  "SEMANTIC_REVIEW",
  "READY_FOR_REVIEW",
  "APPROVED",
  "FAILED",
  "CANCELLED",
] as const;

export type ScanRunState = (typeof SCAN_RUN_STATES)[number];

export const isScanRunState = (value: unknown): value is ScanRunState =>
  typeof value === "string" && (SCAN_RUN_STATES as readonly string[]).includes(value);

const IN_PROGRESS: ReadonlySet<ScanRunState> = new Set([
  "QUEUED",
  "EXTRACTING",
  "ANALYZING_LAYOUT",
  "STRUCTURING",
  "SEMANTIC_REVIEW",
]);

export const isInProgress = (state: ScanRunState): boolean => IN_PROGRESS.has(state);

/** Estados em que a proposta existe e pode ser revisada. */
export const isReviewable = (state: ScanRunState): boolean =>
  state === "READY_FOR_REVIEW" || state === "APPROVED";

export const SCAN_RUN_LABELS: Readonly<Record<ScanRunState, string>> = {
  QUEUED: "na fila",
  EXTRACTING: "lendo páginas",
  ANALYZING_LAYOUT: "medindo layout",
  STRUCTURING: "montando a estrutura",
  SEMANTIC_REVIEW: "consultando a IA",
  READY_FOR_REVIEW: "pronta para revisar",
  APPROVED: "aprovada",
  FAILED: "falhou",
  CANCELLED: "cancelada",
};

/** A versão do motor. Muda quando a mesma entrada passa a produzir outra proposta. */
export const ENGINE_VERSION = "scan-engine@1";

export type MathRecognitionPolicy = "never" | "auto" | "always";

export interface ScanSettings {
  readonly pageFrom: number;
  /** `null` é "até o fim"; a execução descobre o número ao abrir o PDF. */
  readonly pageTo: number | null;
  readonly useAi: boolean;
  readonly recognizeMath: MathRecognitionPolicy;
}

export class InvalidScanSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidScanSettingsError";
  }
}

export function normalizeSettings(input: {
  readonly pageFrom?: unknown;
  readonly pageTo?: unknown;
  readonly useAi?: unknown;
  readonly recognizeMath?: unknown;
}): ScanSettings {
  const pageFrom = input.pageFrom === undefined || input.pageFrom === null ? 1 : Number(input.pageFrom);
  const pageTo =
    input.pageTo === undefined || input.pageTo === null || input.pageTo === "" ? null : Number(input.pageTo);

  if (!Number.isInteger(pageFrom) || pageFrom < 1) {
    throw new InvalidScanSettingsError("A página inicial precisa ser um inteiro a partir de 1.");
  }
  if (pageTo !== null && (!Number.isInteger(pageTo) || pageTo < pageFrom)) {
    throw new InvalidScanSettingsError("A página final precisa ser um inteiro, e não antes da inicial.");
  }

  const recognizeMath =
    input.recognizeMath === "never" || input.recognizeMath === "always" ? input.recognizeMath : "auto";

  return { pageFrom, pageTo, useAi: input.useAi === true, recognizeMath };
}

/**
 * O que identifica uma execução: o mesmo arquivo, o mesmo perfil na mesma versão, o mesmo motor e
 * a mesma configuração. Em texto canônico — as chaves em ordem fixa —, para que o hash não dependa
 * de quem montou o objeto.
 */
export function runKeySource(input: {
  readonly sourceSha256: string;
  readonly profileId: string;
  readonly profileVersion: number;
  readonly engineVersion: string;
  readonly settings: ScanSettings;
}): string {
  const { settings } = input;
  return JSON.stringify([
    input.sourceSha256,
    `${input.profileId}@${input.profileVersion}`,
    input.engineVersion,
    settings.pageFrom,
    settings.pageTo,
    settings.useAi,
    settings.recognizeMath,
  ]);
}

/** Sem batimento há mais que isto, uma execução "em andamento" foi interrompida. */
export const HEARTBEAT_TIMEOUT_MS = 90_000;

/**
 * Interrompida: em andamento no banco, e ninguém cuidando dela. O batimento anterior ao início
 * deste processo já responde — o servidor reiniciou no meio —, sem esperar o prazo vencer.
 */
export function isInterrupted(
  run: { readonly state: ScanRunState; readonly heartbeatAt: Date | null; readonly createdAt: Date },
  clock: { readonly runningHere: boolean; readonly now: Date; readonly processStartedAt: Date },
): boolean {
  if (!isInProgress(run.state) || clock.runningHere) return false;
  const last = run.heartbeatAt ?? run.createdAt;
  return (
    last.getTime() < clock.processStartedAt.getTime() ||
    clock.now.getTime() - last.getTime() > HEARTBEAT_TIMEOUT_MS
  );
}

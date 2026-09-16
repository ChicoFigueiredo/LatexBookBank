import type { ScanItem } from "@modules/scan/domain/scan-item";
import { isInProgress, isInterrupted } from "@modules/scan/domain/scan-run";

import type { ScanRun, ScanRunner, ScanStore } from "./scan-store";

/**
 * Ler, cancelar e retomar uma execução (§47–§49).
 */

export class ScanRunNotFoundError extends Error {
  constructor(readonly runId: string) {
    super("Execução de scan não encontrada.");
    this.name = "ScanRunNotFoundError";
  }
}

export class ScanRunStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScanRunStateError";
  }
}

export interface ScanRunView {
  readonly run: ScanRun;
  readonly interrupted: boolean;
  readonly running: boolean;
  readonly items: readonly ScanItem[];
}

const PROCESS_STARTED_AT = new Date(Date.now() - Math.round(process.uptime() * 1000));

export async function getScan(
  deps: { readonly store: ScanStore; readonly runner: ScanRunner; readonly now?: () => Date },
  runId: string,
  options: { readonly withItems: boolean } = { withItems: true },
): Promise<ScanRunView> {
  const run = await deps.store.findRun(runId);
  if (!run) throw new ScanRunNotFoundError(runId);
  const running = deps.runner.isRunning(runId);

  return {
    run,
    running,
    interrupted: isInterrupted(run, {
      runningHere: running,
      now: deps.now?.() ?? new Date(),
      processStartedAt: PROCESS_STARTED_AT,
    }),
    items: options.withItems ? await deps.store.listItems(runId) : [],
  };
}

export async function cancelScan(
  deps: { readonly store: ScanStore; readonly runner: ScanRunner },
  runId: string,
): Promise<void> {
  const run = await deps.store.findRun(runId);
  if (!run) throw new ScanRunNotFoundError(runId);
  if (!isInProgress(run.state)) {
    throw new ScanRunStateError("Só uma execução em andamento pode ser cancelada.");
  }

  await deps.store.updateRun(runId, { cancelRequested: true });
  // Ninguém cuidando dela (o servidor reiniciou): o laço não vai ver o pedido, então o estado
  // muda aqui mesmo.
  if (!deps.runner.isRunning(runId)) {
    await deps.store.updateRun(runId, { state: "CANCELLED", finishedAt: new Date() });
  }
}

/** Retomar do ponto de parada — uma execução interrompida, que falhou ou foi cancelada. */
export async function resumeScan(
  deps: { readonly store: ScanStore; readonly runner: ScanRunner },
  runId: string,
): Promise<void> {
  const run = await deps.store.findRun(runId);
  if (!run) throw new ScanRunNotFoundError(runId);
  if (run.state === "READY_FOR_REVIEW" || run.state === "APPROVED") {
    throw new ScanRunStateError("Esta execução já terminou; para varrer de novo, peça um novo scan.");
  }
  if (deps.runner.isRunning(runId)) return;

  await deps.store.updateRun(runId, {
    cancelRequested: false,
    state: run.state === "FAILED" || run.state === "CANCELLED" ? "QUEUED" : run.state,
    error: null,
    finishedAt: null,
  });
  deps.runner.ensure(runId);
}

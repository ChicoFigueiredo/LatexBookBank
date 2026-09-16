import "server-only";

import type { ScanRunner } from "@modules/scan/application/scan-store";

/**
 * O laço do scan, dentro do próprio processo do Next (D49).
 *
 * Um `Map` no `globalThis` com as execuções em curso: sobrevive ao hot reload, e responde "há
 * alguém cuidando desta?" para a tela oferecer *Retomar* quando não há. Não é fila distribuída —
 * um worker separado, como o renderer, fica para quando houver motivo; o caso de uso não muda.
 */

const holder = globalThis as typeof globalThis & {
  __latexbookbankScanRuns?: Map<string, Promise<void>>;
};
const active = (holder.__latexbookbankScanRuns ??= new Map<string, Promise<void>>());

export class InProcessScanRunner implements ScanRunner {
  constructor(private readonly work: (runId: string) => Promise<void>) {}

  ensure(runId: string): void {
    if (active.has(runId)) return;
    const task = this.work(runId)
      .catch((error: unknown) => {
        // O caso de uso já grava a falha na execução; chegar aqui é defeito do próprio laço.
        console.error(`[scan] execução ${runId} terminou com erro não tratado`, error);
      })
      .finally(() => active.delete(runId));
    active.set(runId, task);
  }

  isRunning(runId: string): boolean {
    return active.has(runId);
  }
}

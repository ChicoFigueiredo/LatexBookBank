import type { ScanRun } from "@modules/scan/application/scan-store";
import { SCAN_RUN_LABELS } from "@modules/scan/domain/scan-run";

/** A execução como a tela a lê: datas em ISO, estado com rótulo. */
export function scanRunDto(run: ScanRun, running: boolean, interrupted = false) {
  return {
    ...run,
    stateLabel: SCAN_RUN_LABELS[run.state],
    running,
    interrupted,
    heartbeatAt: run.heartbeatAt?.toISOString() ?? null,
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
  };
}

export type ScanRunDto = ReturnType<typeof scanRunDto>;

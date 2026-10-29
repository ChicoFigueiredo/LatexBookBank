import type { ScanRun } from "@modules/scan/application/scan-store";
import { SCAN_RUN_LABELS } from "@modules/scan/domain/scan-run";

/**
 * A execução como a tela a lê: datas em ISO, estado com rótulo.
 *
 * Mora no módulo, e não em `app/api`, porque rota **e** página a usam: a página que importava DTO
 * de arquivo de rota acoplava as duas camadas de entrega (STE-16 da revisão de 2026-09-23). Só
 * depende de tipo e de rótulo de domínio, então o cliente do navegador importa o tipo daqui
 * (`ScanRunView` em `scan-client.ts`) — o `tsc` liga a rota à tela pelo mesmo nome (ARQ-10).
 */
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

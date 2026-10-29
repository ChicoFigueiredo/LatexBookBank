import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { BackupStatusFile } from "@modules/diagnostics/domain/backup-status";

/**
 * As sondas do `/diagnostico` que tocam rede e disco.
 *
 * Moravam na camada de aplicação, que fazia `fetch` e `readFile` por conta própria (STM-14). Aqui
 * elas só dizem o que encontraram; o que isso significa para a página — "não configurado", "fora
 * do ar", "nunca executado" — continua sendo decidido em `collect-diagnostics`.
 */

/** Dois segundos: a página não pode ficar presa esperando um serviço morto. */
const PROBE_TIMEOUT_MS = 2_000;

export type RendererHealth =
  | { readonly kind: "ok"; readonly payload: Readonly<Record<string, unknown>> }
  | { readonly kind: "http-error"; readonly status: number }
  | { readonly kind: "unreachable" };

/** O `/health` do worker, sem interpretar: quem chama decide o que é estar no ar. */
export async function probeRendererHealth(baseUrl: string): Promise<RendererHealth> {
  try {
    const response = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!response.ok) return { kind: "http-error", status: response.status };
    return { kind: "ok", payload: (await response.json()) as Record<string, unknown> };
  } catch {
    return { kind: "unreachable" };
  }
}

/**
 * O estado que o serviço de backup deixou no destino, ou `null` quando não há arquivo legível.
 *
 * Um arquivo, e não uma consulta ao serviço: o backup roda fora do app e pode estar parado
 * justamente quando se quer saber dele. O arquivo continua lá — e "o último backup foi há seis
 * dias" é exatamente a informação que importa nessa hora.
 */
export async function readBackupStatusFile(destination: string): Promise<BackupStatusFile | null> {
  try {
    const raw = await readFile(join(destination, "backup-status.json"), "utf8");
    return JSON.parse(raw) as BackupStatusFile;
  } catch {
    return null;
  }
}

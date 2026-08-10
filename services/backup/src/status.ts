import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { BackupOutcome } from "./run-backup";

/**
 * O estado do último backup, num arquivo que a página de diagnóstico lê.
 *
 * Existe porque **falha de backup não pode ser silenciosa**. Um backup que falha sem avisar é
 * pior que nenhum: ele cria a impressão de que existe, e a descoberta acontece no dia em que
 * alguém precisa restaurar.
 *
 * Um arquivo e não uma tabela: o serviço roda fora do app, e escrever no banco do app faria dele
 * um segundo escritor daquele banco — justamente o acoplamento que separar os processos evitou.
 *
 * Ver D32 · D36 · issue #117.
 */

export const STATUS_FILENAME = "backup-status.json";

export interface BackupStatus {
  readonly finishedAt: string;
  readonly ok: boolean;
  readonly workspaces: number;
  readonly totalBytes: number;
  readonly failures: readonly { readonly workspaceId: string; readonly message: string }[];
  readonly lastArchives: readonly { readonly slug: string; readonly bytes: number }[];
}

export async function writeStatus(destination: string, outcome: BackupOutcome): Promise<void> {
  const status: BackupStatus = {
    finishedAt: new Date().toISOString(),
    // Sucesso parcial **não** é sucesso: um workspace que falhou precisa fazer o indicador ficar
    // vermelho, ou ninguém olha.
    ok: outcome.failures.length === 0 && outcome.archives.length > 0,
    workspaces: outcome.archives.length,
    totalBytes: outcome.archives.reduce((total, archive) => total + archive.bytes.byteLength, 0),
    failures: outcome.failures,
    lastArchives: outcome.archives.map((archive) => ({
      slug: archive.slug,
      bytes: archive.bytes.byteLength,
    })),
  };

  await writeFile(join(destination, STATUS_FILENAME), JSON.stringify(status, null, 2));
}

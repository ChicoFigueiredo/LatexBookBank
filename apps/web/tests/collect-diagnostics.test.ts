import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { resetEnvCache } from "@/shared/config/env";

import { createTempDatabase } from "./support/temp-database";

// Monta um SQLite com as migrações e sonda o TeX da máquina: com a suíte em paralelo passa dos 5 s.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * O `/diagnostico` pelo caso de uso: o backup e o worker nos três estados que a página distingue.
 *
 * A configuração passa por `env()` (STM-14): o `BACKUP_DESTINATION` era lido cru, e a leitura do
 * arquivo e a sonda do worker moravam na camada de aplicação. O que se afirma aqui é o que a
 * página mostra, e vale antes e depois de essa leitura ir para a infraestrutura.
 */

let dispose: () => Promise<void>;
let dir: string;

beforeAll(async () => {
  dispose = (await createTempDatabase()).dispose;
  dir = mkdtempSync(path.join(tmpdir(), "lbb-diag-"));
});
afterAll(async () => {
  await dispose();
  rmSync(dir, { recursive: true, force: true });
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

function ambiente(vars: Record<string, string | undefined>) {
  vi.stubEnv("AI_BASE_URL", undefined);
  vi.stubEnv("RENDERER_BASE_URL", undefined);
  vi.stubEnv("RENDERER_SECRET", undefined);
  vi.stubEnv("BACKUP_DESTINATION", undefined);
  vi.stubEnv("BACKUP_INTERVAL_HOURS", undefined);
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);
  resetEnvCache();
}

const diagnostico = async () => {
  const { collectDiagnostics } =
    await import("@modules/diagnostics/application/collect-diagnostics");
  return collectDiagnostics();
};

describe("o backup no /diagnostico", () => {
  it("sem destino é 'não configurado'", async () => {
    ambiente({});
    expect((await diagnostico()).backup.health).toBe("unconfigured");
  });

  it("destino só com espaços também é 'não configurado'", async () => {
    // Lido cru, `"  "` contava como destino e a página procurava um arquivo numa pasta em branco.
    ambiente({ BACKUP_DESTINATION: "   " });
    expect((await diagnostico()).backup.health).toBe("unconfigured");
  });

  it("destino sem arquivo de estado é 'nunca executado', e não erro", async () => {
    const vazio = mkdtempSync(path.join(dir, "vazio-"));
    ambiente({ BACKUP_DESTINATION: vazio });

    const { backup } = await diagnostico();

    expect(backup.health).toBe("off");
    expect(backup.summary).toBe("Backup configurado, mas nunca executado");
  });

  it("o estado gravado pelo serviço vira o resumo, com o destino nos detalhes", async () => {
    const destino = mkdtempSync(path.join(dir, "ok-"));
    writeFileSync(
      path.join(destino, "backup-status.json"),
      JSON.stringify({
        finishedAt: new Date(Date.now() - 3_600_000).toISOString(),
        ok: true,
        workspaces: 2,
        totalBytes: 1024,
        failures: [],
      }),
    );
    ambiente({ BACKUP_DESTINATION: destino, BACKUP_INTERVAL_HOURS: "24" });

    const { backup } = await diagnostico();

    expect(backup.health).toBe("ok");
    expect(backup.details[0]).toEqual({ label: "Destino", value: destino });
  });
});

describe("o worker de render no /diagnostico", () => {
  it("sem endereço é 'não configurado'", async () => {
    ambiente({});
    expect((await diagnostico()).renderer.health).toBe("unconfigured");
  });

  it("configurado e sem resposta é 'fora do ar', com a causa provável", async () => {
    // Porta 9 (discard) em loopback: recusa a conexão na hora, sem depender de rede.
    ambiente({ RENDERER_BASE_URL: "http://127.0.0.1:9", RENDERER_SECRET: "x" });

    const { renderer } = await diagnostico();

    expect(renderer.health).toBe("off");
    expect(renderer.summary).toBe("Worker configurado, mas não respondeu");
  });
});

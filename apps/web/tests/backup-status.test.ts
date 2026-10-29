import { describe, expect, it } from "vitest";

import { describeBackupStatus } from "@modules/diagnostics/domain/backup-status";

/**
 * O indicador de backup (PLT-13): verde só enquanto o último sucesso é recente.
 *
 * Ele ficava verde para sempre depois do último `ok: true`. O serviço morria, o arquivo de estado
 * continuava dizendo "ok" de vinte dias atrás, e a barra de status mostrava "em dia" até o dia de
 * precisar restaurar.
 */

const NOW = new Date("2026-10-28T12:00:00.000Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
const ok = (finishedAt: string, extra: Record<string, unknown> = {}) => ({
  finishedAt,
  ok: true,
  workspaces: 3,
  totalBytes: 2 * 1024 * 1024,
  failures: [],
  ...extra,
});

describe("describeBackupStatus", () => {
  it("sucesso dentro do intervalo é verde", () => {
    const status = describeBackupStatus(ok(hoursAgo(20)), { now: NOW, intervalHours: 24 });

    expect(status.health).toBe("ok");
    expect(status.summary).toMatch(/^Último backup: /);
  });

  it("sucesso de mais de duas rodadas atrás não é verde: o serviço parou", () => {
    const status = describeBackupStatus(ok(hoursAgo(20 * 24)), { now: NOW, intervalHours: 24 });

    expect(status.health).toBe("off");
    expect(status.summary).toMatch(/atrasado/);
    expect(status.summary).toMatch(/20 dias/);
  });

  it("o intervalo que o serviço gravou no próprio estado vence o do app", () => {
    // O serviço roda a cada 6 h; o app não tem a variável e cairia nas 24 h padrão.
    const status = describeBackupStatus(ok(hoursAgo(13), { intervalHours: 6 }), {
      now: NOW,
      intervalHours: 24,
    });

    expect(status.health).toBe("off");
  });

  it("falha continua vermelha, com a data", () => {
    const status = describeBackupStatus(
      {
        finishedAt: hoursAgo(1),
        ok: false,
        failures: [{ workspaceId: "*", message: "ECONNREFUSED" }],
      },
      { now: NOW, intervalHours: 24 },
    );

    expect(status.health).toBe("off");
    expect(status.summary).toMatch(/falhou/);
    expect(status.details.map((detail) => detail.value)).toContain("ECONNREFUSED");
  });

  it("estado sem data não é sucesso — não se sabe de quando é", () => {
    expect(describeBackupStatus({ ok: true }, { now: NOW, intervalHours: 24 }).health).toBe("off");
  });
});

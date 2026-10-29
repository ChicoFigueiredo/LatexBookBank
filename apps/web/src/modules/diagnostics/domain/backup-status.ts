import { formatarTamanho } from "@/shared/format/bytes";

import type { SectionStatus } from "./diagnostics";

/**
 * O estado do backup, dito a partir do arquivo que o serviço deixa (`backup-status.json`).
 *
 * **Verde só enquanto o último sucesso é recente** (PLT-13). A saúde era decidida só por
 * `ok === true`: o serviço morria, o arquivo continuava dizendo "ok" de vinte dias atrás, e a barra
 * de status mostrava "em dia" até o dia de precisar restaurar. Agora um sucesso mais velho que duas
 * rodadas é atraso — uma rodada perdida pode ser a máquina desligada à noite; duas, não.
 *
 * O intervalo vem do próprio estado quando o serviço o grava (é dele que se trata), e do ambiente
 * do app quando não.
 */

export interface BackupStatusFile {
  readonly finishedAt?: string;
  readonly ok?: boolean;
  readonly workspaces?: number;
  readonly totalBytes?: number;
  /** O intervalo com que o serviço roda, em horas. */
  readonly intervalHours?: number;
  readonly failures?: readonly { readonly workspaceId: string; readonly message: string }[];
}

/** Quantas rodadas perdidas fazem o verde virar atraso. */
const MISSED_ROUNDS = 2;

export function describeBackupStatus(
  status: BackupStatusFile,
  context: { readonly now: Date; readonly intervalHours: number },
): SectionStatus {
  const when = status.finishedAt ? new Date(status.finishedAt) : null;
  const valid = when !== null && !Number.isNaN(when.getTime());
  const failures = status.failures ?? [];
  const intervalHours =
    typeof status.intervalHours === "number" && status.intervalHours > 0
      ? status.intervalHours
      : context.intervalHours;

  const details = [
    { label: "Bibliotecas", value: String(status.workspaces ?? 0) },
    { label: "Intervalo", value: `${intervalHours} h` },
    ...failures.map((failure) => ({
      label: `Falha (${failure.workspaceId})`,
      value: failure.message.slice(0, 200),
    })),
  ];

  if (status.ok !== true || !valid) {
    return {
      health: "off",
      summary: valid ? `Último backup falhou — ${format(when)}` : "Estado do backup sem data",
      details,
    };
  }

  const ageHours = (context.now.getTime() - when.getTime()) / 3_600_000;
  if (ageHours > MISSED_ROUNDS * intervalHours) {
    return {
      health: "off",
      summary: `Backup atrasado: o último foi há ${age(ageHours)} (${format(when)}) — o serviço parou?`,
      details,
    };
  }

  return {
    health: "ok",
    summary: `Último backup: ${format(when)} · ${formatarTamanho(status.totalBytes ?? 0)}`,
    details,
  };
}

const age = (hours: number): string =>
  hours < 48 ? `${Math.round(hours)} h` : `${Math.floor(hours / 24)} dias`;

const format = (date: Date | null): string =>
  date === null ? "—" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

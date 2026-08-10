/**
 * A configuração do backup, lida do ambiente.
 *
 * Frequência, retenção e destino são variáveis — nenhuma delas está no código. Um backup com
 * período fixo é um backup que alguém desliga quando não serve, e um backup desligado é o mesmo
 * que não ter backup.
 *
 * **Não há `DATABASE_URL` aqui, e é de propósito.** Ver `main.ts`.
 *
 * Ver D32 · D36 · issue #117.
 */

export interface BackupConfig {
  /** O app. O backup pede o `.lbb` a ele — não lê o banco. */
  readonly appBaseUrl: string;
  /** Onde os `.lbb` são gravados. Um diretório: local hoje, ponto de montagem amanhã. */
  readonly destination: string;
  readonly intervalMs: number;
  /** Quantos arquivos manter **por workspace**. Os mais antigos saem. */
  readonly keep: number;
}

const HOUR = 60 * 60 * 1000;

export class BackupConfigError extends Error {
  constructor(problems: readonly string[]) {
    super(
      `Configuração de backup inválida:\n${problems.map((p) => `  · ${p}`).join("\n")}\n\n` +
        "Defina as variáveis no ambiente do serviço.",
    );
    this.name = "BackupConfigError";
  }
}

export function loadConfig(source: Record<string, string | undefined> = process.env): BackupConfig {
  const problems: string[] = [];
  const get = (key: string): string | null => source[key]?.trim() || null;

  const appBaseUrl = get("APP_BASE_URL");
  if (!appBaseUrl) problems.push("APP_BASE_URL ausente");

  const destination = get("BACKUP_DESTINATION");
  if (!destination) problems.push("BACKUP_DESTINATION ausente");

  const intervalHours = Number(get("BACKUP_INTERVAL_HOURS") ?? "24");
  if (!Number.isFinite(intervalHours) || intervalHours <= 0) {
    problems.push("BACKUP_INTERVAL_HOURS precisa ser um número de horas maior que zero");
  }

  const keep = Number(get("BACKUP_KEEP") ?? "7");
  if (!Number.isInteger(keep) || keep < 1) {
    problems.push("BACKUP_KEEP precisa ser um inteiro maior ou igual a 1");
  }

  if (problems.length > 0) throw new BackupConfigError(problems);

  return {
    appBaseUrl: (appBaseUrl as string).replace(/\/$/, ""),
    destination: destination as string,
    intervalMs: intervalHours * HOUR,
    keep,
  };
}

/**
 * Log estruturado — uma linha JSON por evento.
 *
 * JSON e não texto porque o log deste app é lido por quem está investigando alguma coisa, não por
 * quem está acompanhando. `grep` numa linha formatada acha a palavra e perde o contexto; um
 * campo achado num JSON traz o evento inteiro.
 *
 * O domínio é obrigatório e vem de lista fechada: sem ele, filtrar "só render" exige adivinhar o
 * prefixo que alguém escolheu naquele dia.
 *
 * ## O que **não** entra no log
 *
 * Prompt completo, conteúdo de questão, chave de API e senha de banco. O log sobrevive a limpezas
 * de tela, vai para backup e é lido por quem está investigando outra coisa — e um enunciado de
 * prova inteiro ali é vazamento por acúmulo, mesmo que cada linha pareça inofensiva.
 *
 * Ver spec §25 · §14 · issue #131.
 */

export const LOG_DOMAINS = ["render", "import", "agent", "persistence", "storage", "http"] as const;
export type LogDomain = (typeof LOG_DOMAINS)[number];

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  readonly [key: string]: string | number | boolean | null | undefined;
}

export interface LogEvent {
  readonly at: string;
  readonly level: LogLevel;
  readonly domain: LogDomain;
  readonly event: string;
  readonly fields: LogFields;
}

/**
 * Campos que **nunca** são gravados, mesmo que alguém os passe.
 *
 * Uma lista de proibidos aqui — e não de permitidos — porque o conjunto de campos úteis é aberto
 * e cresce com o produto, enquanto o de campos perigosos é curto e conhecido. O custo de errar
 * para o lado errado também é assimétrico: um campo útil omitido atrapalha uma investigação; uma
 * chave gravada vira um incidente.
 */
const FORBIDDEN = new Set([
  "prompt",
  "promptFull",
  "messages",
  "apiKey",
  "api_key",
  "authorization",
  "password",
  "secret",
  "token",
  "databaseUrl",
  "statementLatex",
  "solutionLatex",
]);

/** Valor longo demais para log. Além disso é conteúdo, e conteúdo não é evento. */
const MAX_VALUE_CHARS = 500;

export interface Logger {
  debug(domain: LogDomain, event: string, fields?: LogFields): void;
  info(domain: LogDomain, event: string, fields?: LogFields): void;
  warn(domain: LogDomain, event: string, fields?: LogFields): void;
  error(domain: LogDomain, event: string, fields?: LogFields): void;
}

export interface LoggerOptions {
  /** Injetável para teste; em produção escreve na saída padrão. */
  readonly write?: (line: string) => void;
  readonly now?: () => Date;
  /** Abaixo deste nível nada é gravado. `info` por padrão. */
  readonly minLevel?: LogLevel;
}

const ORDER: Readonly<Record<LogLevel, number>> = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(options: LoggerOptions = {}): Logger {
  const write = options.write ?? ((line: string) => console.log(line));
  const now = options.now ?? (() => new Date());
  const threshold = ORDER[options.minLevel ?? "info"];

  const emit = (level: LogLevel, domain: LogDomain, event: string, fields?: LogFields): void => {
    if (ORDER[level] < threshold) return;

    const entry: LogEvent = {
      at: now().toISOString(),
      level,
      domain,
      event,
      fields: sanitize(fields ?? {}),
    };

    write(JSON.stringify(entry));
  };

  return {
    debug: (domain, event, fields) => emit("debug", domain, event, fields),
    info: (domain, event, fields) => emit("info", domain, event, fields),
    warn: (domain, event, fields) => emit("warn", domain, event, fields),
    error: (domain, event, fields) => emit("error", domain, event, fields),
  };
}

/**
 * Tira o que não pode ser gravado.
 *
 * Campo proibido vira `"[omitido]"` em vez de sumir: a ausência silenciosa faria quem lê o log
 * concluir que o valor não existia, e "o prompt estava vazio" é uma conclusão bem diferente de
 * "o prompt não é gravado".
 */
export function sanitize(fields: LogFields): LogFields {
  const clean: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;

    if (FORBIDDEN.has(key)) {
      clean[key] = "[omitido]";
      continue;
    }

    if (typeof value === "string" && value.length > MAX_VALUE_CHARS) {
      clean[key] = `${value.slice(0, MAX_VALUE_CHARS)}…[+${value.length - MAX_VALUE_CHARS}]`;
      continue;
    }

    clean[key] = value;
  }

  return clean;
}

/** O logger do processo. Um só, e configurado por ambiente. */
export const logger: Logger = createLogger({
  ...(process.env["LOG_LEVEL"] !== undefined
    ? { minLevel: process.env["LOG_LEVEL"] as LogLevel }
    : {}),
});

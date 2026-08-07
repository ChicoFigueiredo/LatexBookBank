import "server-only";

/**
 * Configuração de infraestrutura, lida do ambiente e validada uma vez.
 *
 * É isto que torna a subida para a nuvem uma troca de variáveis em vez de uma troca de código:
 * nenhum endereço aparece literal, e **não existe `if (isProduction)` decidindo infraestrutura**.
 * Trocar `STORAGE_ROOT` por um bucket ou `RENDERER_BASE_URL` por um droplet não toca em domínio.
 *
 * Validação escrita à mão, e não com Zod, de propósito: a spec reserva Zod para entrada e saída
 * de API, onde o schema é rico e o erro vai para o usuário. Aqui são cinco chaves e o erro vai
 * para quem está subindo o app — o custo de uma dependência não se paga.
 *
 * Ver `docs/_atual/_planejamento.md` §4.4 · D21.
 */

export interface AppEnv {
  /** Conexão do Prisma. SQLite no modo local (D24). */
  readonly databaseUrl: string;
  /** Raiz do `LocalFileStorageProvider`. Vira endpoint de bucket no modo cloud. */
  readonly storageRoot: string;
  /** Worker de render (Fase 6). `localhost:28900` em Docker local, droplet em produção. */
  readonly rendererBaseUrl: string | null;
  /** Segredo compartilhado com o worker. Nunca vai para o browser. */
  readonly rendererSecret: string | null;
  /** Endpoint OpenAI-compatible: OpenRouter, OpenAI, Ollama, LM Studio (D3). */
  readonly aiBaseUrl: string | null;
  readonly aiApiKey: string | null;
  readonly aiModel: string | null;
}

class EnvError extends Error {
  constructor(problems: readonly string[]) {
    super(
      `Configuração de ambiente inválida:\n${problems.map((p) => `  · ${p}`).join("\n")}\n\n` +
        "Rode `pnpm setup`, ou copie `apps/web/.env.example` para `apps/web/.env.local`.",
    );
    this.name = "EnvError";
  }
}

const read = (key: string): string | null => {
  const value = process.env[key]?.trim();
  return value ? value : null;
};

/** Fonte de variáveis. `Record` em vez de `NodeJS.ProcessEnv`: a função não precisa das chaves
 * conhecidas que aquele tipo exige, e o `Record` deixa os testes montarem ambientes parciais. */
export type EnvSource = Readonly<Record<string, string | undefined>>;

export function loadEnv(source: EnvSource = process.env): AppEnv {
  const problems: string[] = [];

  const get = (key: string): string | null => {
    const value = source[key]?.trim();
    return value ? value : null;
  };

  const databaseUrl = get("DATABASE_URL");
  if (!databaseUrl) problems.push("DATABASE_URL ausente");

  const rendererBaseUrl = get("RENDERER_BASE_URL");
  if (rendererBaseUrl && !isHttpUrl(rendererBaseUrl)) {
    problems.push(`RENDERER_BASE_URL não é uma URL http(s): ${rendererBaseUrl}`);
  }

  const aiBaseUrl = get("AI_BASE_URL");
  if (aiBaseUrl && !isHttpUrl(aiBaseUrl)) {
    problems.push(`AI_BASE_URL não é uma URL http(s): ${aiBaseUrl}`);
  }

  // Um worker configurado sem segredo aceitaria requisição de qualquer origem. Falhar aqui é
  // melhor do que descobrir isso em produção.
  const rendererSecret = get("RENDERER_SECRET");
  if (rendererBaseUrl && !rendererSecret) {
    problems.push("RENDERER_BASE_URL definido sem RENDERER_SECRET");
  }

  if (problems.length > 0) throw new EnvError(problems);

  return {
    databaseUrl: databaseUrl as string,
    storageRoot: get("STORAGE_ROOT") ?? "./data/storage",
    rendererBaseUrl,
    rendererSecret,
    aiBaseUrl,
    aiApiKey: get("AI_API_KEY"),
    aiModel: get("AI_MODEL"),
  };
}

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

let cached: AppEnv | null = null;

/** Ambiente validado, resolvido uma vez por processo. */
export const env = (): AppEnv => (cached ??= loadEnv());

/** Só para testes: descarta o cache entre casos. */
export const resetEnvCache = (): void => {
  cached = null;
};

export { EnvError, read as readEnvVar };

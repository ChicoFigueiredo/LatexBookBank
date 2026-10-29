import "server-only";

import { LocalFileStorageProvider } from "@infrastructure/storage/local/local-file-storage-provider";
import { env as appEnv } from "@/shared/config/env";

import type { ExecuteRenderDeps } from "../application/execute-render";
import { PrismaRenderJobRepository } from "./prisma-render-job-repository";
import { RenderWorkerExecutor } from "./render-worker-executor";

/**
 * As peças de compilar, montadas a partir do ambiente — ou `null` quando o worker não está
 * configurado.
 *
 * Cada rota de render montava as suas: a guarda de configuração, o executor, o storage e a versão
 * do renderer se repetiam em quatro lugares, e as mensagens já divergiam. `null` e não exceção:
 * sem worker o app continua de pé (Fase 6), e quem chama decide o que dizer.
 */
export function renderWiringFromEnv(): ExecuteRenderDeps | null {
  const env = appEnv();
  if (env.rendererBaseUrl === null || env.rendererSecret === null) return null;

  return {
    executor: new RenderWorkerExecutor({
      baseUrl: env.rendererBaseUrl,
      secret: env.rendererSecret,
    }),
    storage: new LocalFileStorageProvider({ rootDir: env.storageRoot }),
    jobs: new PrismaRenderJobRepository(),
    rendererVersion: process.env["RENDERER_VERSION"] ?? "0.0.0-dev",
  };
}

/** Não configurado é diferente de fora do ar: este se resolve editando `.env.local`. */
export const RENDERER_NOT_CONFIGURED_MESSAGE =
  "`RENDERER_BASE_URL` e `RENDERER_SECRET` não estão definidos. " +
  "Suba o worker com `docker compose up -d` e preencha o `.env.local`.";

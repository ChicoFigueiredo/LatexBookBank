import "server-only";

import { storage } from "@infrastructure/composition";
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
export function renderWiringFromEnv():
  (ExecuteRenderDeps & { executor: RenderWorkerExecutor }) | null {
  const env = appEnv();
  if (env.rendererBaseUrl === null || env.rendererSecret === null) return null;

  const executor = workerFor(env.rendererBaseUrl, env.rendererSecret);
  return {
    executor,
    storage: storage(),
    jobs: new PrismaRenderJobRepository(),
    // A versão que entra no hash é a que o worker reporta, e não a do ambiente da aplicação: é a
    // imagem que compila quem sabe se mudou (PLT-05).
    rendererVersion: () => executor.rendererVersion(),
  };
}

/**
 * Um executor por endereço, guardado no processo: é ele que guarda a versão lida do `/health`, e
 * um executor novo por requisição perguntaria a versão a cada compilação.
 */
let worker: { readonly key: string; readonly executor: RenderWorkerExecutor } | null = null;

function workerFor(baseUrl: string, secret: string): RenderWorkerExecutor {
  const key = `${baseUrl}\u0000${secret}`;
  if (worker?.key !== key) {
    worker = { key, executor: new RenderWorkerExecutor({ baseUrl, secret }) };
  }
  return worker.executor;
}

/** Não configurado é diferente de fora do ar: este se resolve editando `.env.local`. */
export const RENDERER_NOT_CONFIGURED_MESSAGE =
  "`RENDERER_BASE_URL` e `RENDERER_SECRET` não estão definidos. " +
  "Suba o worker com `docker compose up -d` e preencha o `.env.local`.";

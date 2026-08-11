import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";

/**
 * O estado do **último** render de uma questão.
 *
 * Só o estado, e só o último: quem pergunta isto está montando a lista de verificação e quer saber
 * se a questão já compilou. Trazer o job inteiro carregaria diagnósticos e um `stdout` que passa
 * de um megabyte no `pgfplots` — para responder uma palavra.
 */

export type RenderState = "QUEUED" | "RUNNING" | "DONE" | "FAILED" | "CANCELLED";

const STATES: ReadonlySet<string> = new Set<RenderState>([
  "QUEUED",
  "RUNNING",
  "DONE",
  "FAILED",
  "CANCELLED",
]);

export async function lastRenderStateOf(questionId: string): Promise<RenderState | null> {
  const job = await prisma.renderJob.findFirst({
    where: { questionId },
    orderBy: { createdAt: "desc" },
    select: { state: true },
  });

  // Estado fora do vocabulário vira `null`, não exceção: a lista de verificação continua útil sem
  // a linha do render, e derrubá-la por causa de uma linha estranha seria trocar informação por
  // erro.
  return job !== null && STATES.has(job.state) ? (job.state as RenderState) : null;
}

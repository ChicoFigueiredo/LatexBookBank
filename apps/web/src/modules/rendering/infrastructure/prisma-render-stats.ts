import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import { firstErrorMessage } from "@modules/rendering/domain/render-stats";

/**
 * O que o cache de render está ocupando, e o que ele andou fazendo.
 *
 * As três perguntas que a §25 pede — **tamanho do cache**, **jobs** e **último erro** — são as
 * três que alguém faz quando o render está lento, quando o disco encheu, ou quando "não compila"
 * sem mais explicação. Elas ficaram abertas desde a Fase 17 porque não havia quem as respondesse.
 *
 * Tudo aqui é derivado e descartável (D29): apagar os jobs libera o espaço e não perde nada que
 * não se reconstrua compilando de novo. É justamente por isso que o número importa — ele é o
 * único que diz **quanto** se ganharia apagando.
 *
 * Ver spec §25 · issue #168.
 */

export interface RenderStats {
  readonly jobs: number;
  readonly failed: number;
  /** Soma dos bytes dos artefatos derivados. É o que se recupera descartando o cache. */
  readonly cacheBytes: number;
  readonly artifacts: number;
  readonly lastError: {
    readonly at: Date;
    readonly message: string;
  } | null;
}

export async function renderStats(): Promise<RenderStats> {
  const [jobs, failed, artifacts, ultimaFalha] = await Promise.all([
    prisma.renderJob.count(),
    prisma.renderJob.count({ where: { success: false } }),
    // Só derivado: a soma é do **cache**, e incluir fonte diria que apagar o cache recuperaria
    // espaço que na verdade é patrimônio.
    prisma.asset.aggregate({
      where: { renderJobId: { not: null } },
      _sum: { sizeBytes: true },
      _count: true,
    }),
    prisma.renderJob.findFirst({
      where: { success: false },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, diagnosticsJson: true },
    }),
  ]);

  const message = ultimaFalha === null ? null : firstErrorMessage(ultimaFalha.diagnosticsJson);

  return {
    jobs,
    failed,
    cacheBytes: artifacts._sum.sizeBytes ?? 0,
    artifacts: artifacts._count,
    lastError:
      ultimaFalha === null
        ? null
        : {
            at: ultimaFalha.createdAt,
            // Job que falhou sem diagnóstico legível existe — timeout, worker morto no meio. Dizer
            // isso é melhor que esconder a falha por não saber descrevê-la.
            message: message ?? "falhou sem diagnóstico reconhecível (ver a aba Log da questão)",
          },
  };
}

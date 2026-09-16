import { PrismaLibSql } from "@prisma/adapter-libsql";

import { PrismaClient } from "../src/generated/prisma/client.ts";

/**
 * Apaga as questões órfãs — `Question` sem `DocumentNode` nenhum apontando para ela.
 *
 * A órfã é invisível por construção: `Question` só alcança workspace pelo nó, então sem nó ela
 * não aparece em tela, não é exportada e não é escopada por guarda nenhum (achado da #181, quando
 * a busca as devolvia seis vezes). As 12 que existem no banco de desenvolvimento são resíduo de
 * seed de 2026-08-10/11 — sem `legacyId`, sem apelido, criadas em levas de 4 no mesmo
 * milissegundo. Decisão de 2026-09-02: apagar, com relatório do que saiu.
 *
 * O script **lista antes de apagar** e só apaga com `CONFIRM=yes` — sem ele, roda como dry-run e
 * mostra o que apagaria. Questão com nó (mesmo nó excluído por `deletedAt`) nunca entra aqui: nó
 * excluído ainda é dono, e lixeira não é abandono.
 *
 *     CONFIRM=yes bun run scripts/delete-orphan-questions.ts
 */
async function main(): Promise<void> {
  const confirmed = process.env["CONFIRM"] === "yes";

  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL ausente. Rode `bun run setup`.");

  const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });

  try {
    const orphans = await prisma.question.findMany({
      where: { node: null },
      select: {
        id: true,
        nickname: true,
        status: true,
        legacyId: true,
        createdAt: true,
        _count: {
          select: {
            options: true,
            tags: true,
            assets: true,
            renderJobs: true,
            agentRuns: true,
            assessmentItems: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    if (orphans.length === 0) {
      console.log("Nenhuma questão órfã — nada a fazer.");
      return;
    }

    console.log(`${orphans.length} questão(ões) órfã(s):`);
    for (const q of orphans) {
      console.log(
        `  ${q.id} · ${q.createdAt.toISOString()} · ${q.nickname ?? "(sem apelido)"} · ` +
          `${q.status} · legacyId=${q.legacyId ?? "-"} · ${q._count.options} alternativa(s) · ` +
          `${q._count.tags} tag(s)`,
      );
    }

    // Órfã com histórico (asset, render, agente ou avaliação) não é resíduo de seed — é sinal de
    // que alguém trabalhou nela, e apagar seria destruir trabalho, não limpar lixo. Aborta.
    const comHistorico = orphans.filter(
      (q) =>
        q._count.assets > 0 ||
        q._count.renderJobs > 0 ||
        q._count.agentRuns > 0 ||
        q._count.assessmentItems > 0,
    );
    if (comHistorico.length > 0) {
      console.error(
        `\n${comHistorico.length} órfã(s) com histórico (assets/render/agente/avaliação) — ` +
          `não são resíduo de seed. Nada foi apagado; investigue antes.`,
      );
      process.exitCode = 1;
      return;
    }

    if (!confirmed) {
      console.log("\nDry-run. Rode com CONFIRM=yes para apagar.");
      return;
    }

    const ids = orphans.map((q) => q.id);
    const [options, tags, questions] = await prisma.$transaction([
      prisma.questionOption.deleteMany({ where: { questionId: { in: ids } } }),
      prisma.questionTag.deleteMany({ where: { questionId: { in: ids } } }),
      prisma.question.deleteMany({ where: { id: { in: ids } } }),
    ]);

    console.log(
      `\nApagadas: ${questions.count} questão(ões), ${options.count} alternativa(s), ` +
        `${tags.count} vínculo(s) de tag.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

await main();

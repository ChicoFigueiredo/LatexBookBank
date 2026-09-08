import { PrismaLibSql } from "@prisma/adapter-libsql";

import { PrismaClient } from "../src/generated/prisma/client.ts";

/**
 * Religa os `Workspace.legacySourcePath` quando o acervo muda de lugar no filesystem.
 *
 * O caminho gravado no import é uma **âncora de proveniência**, não um detalhe: é dele que sai a
 * pasta `pub<id>` de onde vêm capas, PDFs e figuras (ver `backfill-legacy-assets.ts`). Quando o
 * disco troca de letra — ou, como em 2026-09-08, a máquina é reinstalada e o acervo passa a viver
 * no drive de backup — os 11 caminhos apontam para lugar nenhum, e todo trabalho que precise ler
 * o original para calado.
 *
 * O script **não adivinha**: recebe a raiz antiga e a nova, e só reescreve o caminho de uma
 * biblioteca depois de **confirmar que o arquivo existe no destino**. Biblioteca cujo arquivo não
 * aparece na raiz nova fica intocada e é reportada — apontar para um arquivo ausente seria trocar
 * um caminho quebrado por outro, com a diferença de parecer resolvido.
 *
 *     RAIZ_ANTIGA=/mnt/t/KnowChico RAIZ_NOVA=/mnt/bak/KnowChico \
 *       bun run scripts/religar-acervo-legado.ts            # dry-run
 *     ... CONFIRM=yes bun run scripts/religar-acervo-legado.ts
 */
async function main(): Promise<void> {
  const raizAntiga = process.env["RAIZ_ANTIGA"];
  const raizNova = process.env["RAIZ_NOVA"];
  const confirmado = process.env["CONFIRM"] === "yes";

  if (!raizAntiga || !raizNova) {
    console.error("RAIZ_ANTIGA e RAIZ_NOVA são obrigatórias.");
    process.exitCode = 1;
    return;
  }

  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL ausente. Rode `bun run setup`.");

  const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });

  try {
    const bibliotecas = await prisma.workspace.findMany({
      where: { legacySourcePath: { startsWith: raizAntiga } },
      select: { id: true, name: true, legacySourcePath: true },
      orderBy: { name: "asc" },
    });

    if (bibliotecas.length === 0) {
      console.log(`Nenhuma biblioteca com caminho em ${raizAntiga} — nada a religar.`);
      return;
    }

    const religar: { id: string; nome: string; de: string; para: string }[] = [];
    const ausentes: { nome: string; esperado: string }[] = [];

    for (const b of bibliotecas) {
      const destino = b.legacySourcePath!.replace(raizAntiga, raizNova);
      if (await Bun.file(destino).exists()) {
        religar.push({ id: b.id, nome: b.name, de: b.legacySourcePath!, para: destino });
      } else {
        ausentes.push({ nome: b.name, esperado: destino });
      }
    }

    console.log(`${bibliotecas.length} biblioteca(s) apontando para ${raizAntiga}:`);
    for (const r of religar) console.log(`  religar: ${r.nome}\n    → ${r.para}`);
    for (const a of ausentes) {
      console.log(`  SEM ARQUIVO no destino (fica como está): ${a.nome}\n    esperado: ${a.esperado}`);
    }

    if (!confirmado) {
      console.log(`\nDry-run. ${religar.length} seria(m) religada(s). Rode com CONFIRM=yes.`);
      return;
    }

    for (const r of religar) {
      await prisma.workspace.update({ where: { id: r.id }, data: { legacySourcePath: r.para } });
    }

    console.log(`\nReligadas: ${religar.length}. Intocadas por falta de arquivo: ${ausentes.length}.`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();

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
 *     OLD_ROOT=/mnt/t/KnowChico NEW_ROOT=/mnt/bak/KnowChico \
 *       bun run scripts/relink-legacy-library.ts            # dry-run
 *     ... CONFIRM=yes bun run scripts/relink-legacy-library.ts
 */
async function main(): Promise<void> {
  const oldRoot = process.env["OLD_ROOT"];
  const newRoot = process.env["NEW_ROOT"];
  const confirmed = process.env["CONFIRM"] === "yes";

  if (!oldRoot || !newRoot) {
    console.error("OLD_ROOT e NEW_ROOT são obrigatórias.");
    process.exitCode = 1;
    return;
  }

  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL ausente. Rode `bun run setup`.");

  const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });

  try {
    const libraries = await prisma.workspace.findMany({
      where: { legacySourcePath: { startsWith: oldRoot } },
      select: { id: true, name: true, legacySourcePath: true },
      orderBy: { name: "asc" },
    });

    if (libraries.length === 0) {
      console.log(`Nenhuma biblioteca com caminho em ${oldRoot} — nada a religar.`);
      return;
    }

    const toRelink: { id: string; name: string; from: string; to: string }[] = [];
    const missing: { name: string; expected: string }[] = [];

    for (const b of libraries) {
      const target = b.legacySourcePath!.replace(oldRoot, newRoot);
      if (await Bun.file(target).exists()) {
        toRelink.push({ id: b.id, name: b.name, from: b.legacySourcePath!, to: target });
      } else {
        missing.push({ name: b.name, expected: target });
      }
    }

    console.log(`${libraries.length} biblioteca(s) apontando para ${oldRoot}:`);
    for (const r of toRelink) console.log(`  religar: ${r.name}\n    → ${r.to}`);
    for (const a of missing) {
      console.log(`  SEM ARQUIVO no destino (fica como está): ${a.name}\n    esperado: ${a.expected}`);
    }

    if (!confirmed) {
      console.log(`\nDry-run. ${toRelink.length} seria(m) religada(s). Rode com CONFIRM=yes.`);
      return;
    }

    for (const r of toRelink) {
      await prisma.workspace.update({ where: { id: r.id }, data: { legacySourcePath: r.to } });
    }

    console.log(`\nReligadas: ${toRelink.length}. Intocadas por falta de arquivo: ${missing.length}.`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();

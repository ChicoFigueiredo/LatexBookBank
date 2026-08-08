import { PrismaLibSql } from "@prisma/adapter-libsql";

import { PrismaClient } from "../src/generated/prisma/client.ts";
import {
  formatImportReport,
  importLatexKnowledge,
} from "../src/modules/latex-knowledge/application/import-latex-knowledge.ts";
import { PrismaLatexKnowledgeRepository } from "../src/modules/latex-knowledge/infrastructure/prisma-latex-knowledge-repository.ts";
import { SqliteLegacyLatexReader } from "../src/modules/latex-knowledge/infrastructure/sqlite-legacy-latex-reader.ts";

/**
 * Importa o conhecimento LaTeX do acervo legado (issue #47).
 *
 *     LEGACY_LATEX_METADATA_DB=/caminho/LatexMetadata.db bun run db:import-latex
 *
 * O caminho vem de variável de ambiente porque o acervo legado mora fora do repositório e o
 * endereço muda de máquina para máquina — nenhum literal de infraestrutura no código.
 *
 * Roda em Bun e não em Node por um motivo prático: o resolvedor ESM do Node exige extensão em
 * todo import, e o resto do projeto (que o Next e o Vitest empacotam) escreve sem. O Bun resolve
 * os dois formatos, e o banco legado continua abrindo em modo somente-leitura de qualquer jeito.
 */
async function main(): Promise<void> {
  const legacyPath = process.env["LEGACY_LATEX_METADATA_DB"];
  if (!legacyPath) {
    console.error(
      "LEGACY_LATEX_METADATA_DB ausente. Aponte para o `LatexMetadata.db` do acervo legado.",
    );
    process.exitCode = 1;
    return;
  }

  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL ausente. Rode `bun run setup`.");

  const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });

  try {
    const report = await importLatexKnowledge(
      new SqliteLegacyLatexReader(legacyPath),
      new PrismaLatexKnowledgeRepository(prisma),
    );
    console.log(formatImportReport(report));
  } finally {
    await prisma.$disconnect();
  }
}

await main();

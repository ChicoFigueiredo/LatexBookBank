import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import type {
  LatexKnowledgeReader,
  LatexSnippet,
  LatexSymbolIndexEntry,
  LatexSymbolReader,
} from "@modules/latex-knowledge/domain/latex-knowledge";

/**
 * Leitura do conhecimento LaTeX, para o app.
 *
 * Está em arquivo separado do repositório de escrita por uma razão concreta: aqui usamos o cliente
 * ambiente, que importa `server-only` — é o que a fronteira de lint exige de quem é alcançado por
 * um Route Handler. O importador não pode passar por este caminho, porque `server-only` aborta
 * fora do Next, e por isso o lado da escrita recebe o cliente pelo construtor.
 *
 * Devolve os 652 snippets de uma vez, e é de propósito: são ~90 KB, e o autocomplete precisa
 * responder no tempo de uma tecla. Uma consulta por caractere digitado poria a rede no caminho
 * crítico da digitação — e a lista não muda entre uma sessão e outra.
 */
export class PrismaLatexKnowledgeReader implements LatexKnowledgeReader {
  async listSnippets(): Promise<readonly LatexSnippet[]> {
    const rows = await prisma.latexSnippet.findMany({
      // Prioridade primeiro; o gatilho desempata para a ordem não depender do plano de execução.
      orderBy: [{ priority: "desc" }, { trigger: "asc" }],
    });

    return rows.map((row) => ({
      trigger: row.trigger,
      label: row.label,
      body: row.body,
      documentation: row.documentation,
      priority: row.priority,
      hasPlaceholders: row.hasPlaceholders,
      // O `legacyId` existe para o importador saber o que é dele. Zero significa "não veio do
      // legado" — o que valerá para todo snippet criado dentro do produto.
      legacyId: row.legacyId ?? 0,
    }));
  }
}

/**
 * Leitura dos símbolos para a palette.
 *
 * O índice e as miniaturas são consultas separadas de propósito: `previewSvg` responde por 93% do
 * peso da tabela, e a palette mostra treze grupos mas desenha um de cada vez.
 */
export class PrismaLatexSymbolReader implements LatexSymbolReader {
  async listSymbolGroupNames(): Promise<readonly string[]> {
    const groups = await prisma.latexSymbolGroup.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { name: true },
    });
    return groups.map((group) => group.name);
  }

  async listSymbolIndex(): Promise<readonly LatexSymbolIndexEntry[]> {
    const rows = await prisma.latexSymbol.findMany({
      orderBy: [{ groupId: "asc" }, { sortOrder: "asc" }],
      select: {
        command: true,
        unicode: true,
        requiredPackage: true,
        mathMode: true,
        group: { select: { name: true } },
      },
    });

    return rows.map((row) => ({
      command: row.command,
      groupName: row.group.name,
      unicode: row.unicode,
      requiredPackage: row.requiredPackage,
      mathMode: row.mathMode,
    }));
  }

  async listPreviews(groupName: string): Promise<Readonly<Record<string, string>>> {
    const rows = await prisma.latexSymbol.findMany({
      where: { group: { name: groupName }, previewSvg: { not: null } },
      select: { command: true, previewSvg: true },
    });

    return Object.fromEntries(
      rows.flatMap((row) => (row.previewSvg ? [[row.command, row.previewSvg]] : [])),
    );
  }
}

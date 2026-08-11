import type { PrismaClient } from "@/generated/prisma/client";

import type {
  LatexKnowledge,
  LatexKnowledgeCounts,
  LatexKnowledgeRepository,
} from "../domain/latex-knowledge";

/**
 * Escrita do conhecimento LaTeX no banco do produto.
 *
 * O cliente vem pelo construtor, e não do módulo `server-only`: o importador é um script de
 * linha de comando, e importar aquele módulo faria o `server-only` abortar antes da primeira
 * consulta. Injetar também é o que deixa o caso de uso testável sem banco.
 *
 * **Idempotência por reposição.** Reimportar apaga o que o próprio import escreveu (`legacyId`
 * não nulo) e grava de novo, tudo numa transação. Duas execuções seguidas deixam exatamente o
 * mesmo estado — que é o que "idempotente" quer dizer — sem varrer 3.400 linhas procurando o que
 * mudou. E o filtro por `legacyId` é o que impede que um snippet criado dentro do produto
 * desapareça porque alguém rodou o importador de novo.
 */
export class PrismaLatexKnowledgeRepository implements LatexKnowledgeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async replaceAll(knowledge: LatexKnowledge): Promise<LatexKnowledgeCounts> {
    return this.prisma.$transaction(async (tx) => {
      await tx.latexSnippet.deleteMany({ where: { legacyId: { not: null } } });
      await tx.latexIconMenu.deleteMany({ where: { legacyId: { not: null } } });
      // Símbolos primeiro: o cascade do grupo os levaria junto, mas depender de cascade para
      // ordem de escrita é o tipo de detalhe que muda de comportamento no PostgreSQL (D25).
      await tx.latexSymbol.deleteMany({ where: { legacyId: { not: null } } });
      await tx.latexSymbolGroup.deleteMany({ where: { legacyId: { not: null } } });

      const groups = await Promise.all(
        knowledge.symbolGroups.map((group) =>
          tx.latexSymbolGroup.create({
            data: { name: group.name, sortOrder: group.sortOrder, legacyId: group.legacyId },
          }),
        ),
      );
      const groupIdByName = new Map(groups.map((group) => [group.name, group.id]));

      const symbols = knowledge.symbols.flatMap((symbol) => {
        const groupId = groupIdByName.get(symbol.groupName);
        if (groupId === undefined) return [];
        return [
          {
            groupId,
            command: symbol.command,
            unicode: symbol.unicode,
            requiredPackage: symbol.requiredPackage,
            mathMode: symbol.mathMode,
            previewSvg: symbol.previewSvg,
            sortOrder: symbol.sortOrder,
            legacyId: symbol.legacyId,
          },
        ];
      });

      // `createMany` e não 2.741 `create`: o SQLite aguenta os dois, mas a diferença é entre
      // segundos e minutos, e o importador vai rodar em toda instalação nova.
      const writtenSymbols = await tx.latexSymbol.createMany({ data: symbols });
      const writtenSnippets = await tx.latexSnippet.createMany({
        data: knowledge.snippets.map((snippet) => ({
          trigger: snippet.trigger,
          label: snippet.label,
          body: snippet.body,
          documentation: snippet.documentation,
          priority: snippet.priority,
          hasPlaceholders: snippet.hasPlaceholders,
          legacyId: snippet.legacyId,
        })),
      });
      const writtenIcons = await tx.latexIconMenu.createMany({
        data: knowledge.iconMenus.map((menu) => ({
          groupName: menu.groupName,
          subGroupName: menu.subGroupName,
          name: menu.name,
          template: menu.template,
          shortcut: menu.shortcut,
          sortOrder: menu.sortOrder,
          legacyId: menu.legacyId,
        })),
      });

      return {
        snippets: writtenSnippets.count,
        symbolGroups: groups.length,
        symbols: writtenSymbols.count,
        iconMenus: writtenIcons.count,
      };
    });
  }
}

import "server-only";

import type {
  DeletedNodeRecord,
  PlannedNode,
  DocumentTreeRepository,
  DocumentTreeWriter,
  NewNode,
  TreeNodeRecord,
} from "@modules/document-tree/domain/document-tree-repository";
import { isNodeKind, isNumberingStyle } from "@modules/document-tree/domain/node-kind";
import { prisma } from "@infrastructure/database/sqlite/client";

/**
 * Implementação Prisma de `DocumentTreeRepository`.
 *
 * `kind` e `numberingStyle` são `String` no banco — o conector SQLite não suporta `enum` — então
 * a validação acontece aqui, na saída da infraestrutura. Um valor fora do vocabulário indica
 * dado corrompido ou migration incompleta, e falhar alto é melhor do que renderizar um nó com
 * tipo inventado.
 */
export class PrismaDocumentTreeRepository implements DocumentTreeRepository, DocumentTreeWriter {
  async listByPublication(publicationId: string): Promise<readonly TreeNodeRecord[]> {
    const rows = await prisma.documentNode.findMany({
      where: { publicationId, deletedAt: null },
      orderBy: { sortKey: "asc" },
      select: {
        id: true,
        parentId: true,
        kind: true,
        title: true,
        sortKey: true,
        numberingStyle: true,
        originalLabel: true,
        question: {
          select: {
            id: true,
            type: true,
            updatedAt: true,
            statementLatex: true,
            solutionLatex: true,
            complementLatex: true,
            difficulty: true,
            board: true,
            year: true,
            options: {
              orderBy: { sortKey: "asc" },
              select: { id: true, sortKey: true, statementLatex: true, isCorrect: true },
            },
          },
        },
      },
    });

    return rows.map((row) => {
      if (!isNodeKind(row.kind)) {
        throw new Error(`NodeKind desconhecido no nó ${row.id}: ${row.kind}`);
      }
      if (!isNumberingStyle(row.numberingStyle)) {
        throw new Error(`NumberingStyle desconhecido no nó ${row.id}: ${row.numberingStyle}`);
      }

      return {
        id: row.id,
        parentId: row.parentId,
        kind: row.kind,
        title: row.title,
        sortKey: row.sortKey,
        numberingStyle: row.numberingStyle,
        originalLabel: row.originalLabel,
        question: row.question,
      };
    });
  }

  async create(node: NewNode): Promise<string> {
    const created = await prisma.documentNode.create({
      data: {
        publicationId: node.publicationId,
        parentId: node.parentId,
        kind: node.kind,
        title: node.title,
        sortKey: node.sortKey,
        ...(node.numberingStyle ? { numberingStyle: node.numberingStyle } : {}),
      },
      select: { id: true },
    });
    return created.id;
  }

  async rename(nodeId: string, title: string | null): Promise<void> {
    await prisma.documentNode.update({ where: { id: nodeId }, data: { title } });
  }

  async move(nodeId: string, parentId: string | null, sortKey: string): Promise<void> {
    await prisma.documentNode.update({ where: { id: nodeId }, data: { parentId, sortKey } });
  }

  /**
   * Uma transação, não N updates.
   *
   * Marcar o pai e falhar no meio dos filhos deixaria a árvore com nós apontando para um pai
   * excluído — invisíveis e fora da lixeira. `updateMany` com `in` resolve num comando só.
   */
  async softDeleteMany(nodeIds: readonly string[]): Promise<void> {
    if (nodeIds.length === 0) return;
    await prisma.documentNode.updateMany({
      where: { id: { in: [...nodeIds] } },
      data: { deletedAt: new Date() },
    });
  }

  async restoreMany(nodeIds: readonly string[]): Promise<void> {
    if (nodeIds.length === 0) return;
    await prisma.documentNode.updateMany({
      where: { id: { in: [...nodeIds] } },
      data: { deletedAt: null },
    });
  }

  async listDeleted(publicationId: string): Promise<readonly DeletedNodeRecord[]> {
    const rows = await prisma.documentNode.findMany({
      where: { publicationId, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      select: { id: true, parentId: true, title: true, kind: true, deletedAt: true },
    });

    return rows.map((row) => {
      if (!isNodeKind(row.kind)) {
        throw new Error(`NodeKind desconhecido no nó excluído ${row.id}: ${row.kind}`);
      }
      return {
        id: row.id,
        parentId: row.parentId,
        title: row.title,
        kind: row.kind,
        deletedAt: row.deletedAt as Date,
      };
    });
  }

  /**
   * Duplica a subárvore em **uma** transação: nós, questões, alternativas e tags.
   *
   * Três coisas que a cópia deliberadamente **não** herda:
   *
   * - **`legacyId`.** Além de violar a unicidade `(publicationId, legacyId)`, seria mentira: a
   *   cópia não é a linha do acervo legado. Perder o vínculo é o ponto.
   * - **`validationStatus`.** Duplicar é quase sempre o começo de uma variante — copia-se para
   *   mudar. Herdar "validada" convidaria a publicar uma variante que ninguém revisou com o selo
   *   de quem revisou o original. A cópia nasce `UNVALIDATED` e `DRAFT`.
   *
   * O que **é** herdado, e por quê:
   *
   * - `sourceAnchorId` — a proveniência é do conteúdo, não da linha: as duas questões vieram do
   *   mesmo recorte, e D29 trata a fonte como imutável e compartilhável.
   * - `originalLabel` — a primeira versão disto não copiava, pelo mesmo argumento do `legacyId`.
   *   Duplicar uma seção contra o banco real mostrou o resultado: dois nós "Sem título", porque
   *   as questões do acervo não têm `title` e se identificam justamente pelo rótulo do livro. É
   *   texto descritivo, não chave — a distinção que importa é essa, e não a de "estar na página".
   */
  async duplicateSubtree(publicationId: string, plan: readonly PlannedNode[]): Promise<string> {
    const rootPlan = plan[0];
    if (!rootPlan) throw new Error("Plano de duplicação vazio.");

    return prisma.$transaction(async (tx) => {
      const idMap = new Map<string, string>();

      /**
       * O `parentId` da **raiz** da cópia é um nó que já existe — o destino escolhido —, não uma
       * cópia. Passá-lo pelo mapa devolveria `null`, e a subárvore inteira apareceria na raiz da
       * publicação em vez de dentro do destino. Para os demais, o pai é sempre uma cópia já
       * criada (a pré-ordem garante), e não achá-la é bug, não caso normal.
       */
      const resolveParent = (step: PlannedNode, isRoot: boolean): string | null => {
        if (isRoot || step.parentId === null) return step.parentId;
        const mapped = idMap.get(step.parentId);
        if (!mapped)
          throw new Error(`Plano fora de pré-ordem: pai ${step.parentId} ainda não foi criado.`);
        return mapped;
      };

      for (const step of plan) {
        const source = await tx.documentNode.findUniqueOrThrow({
          where: { id: step.sourceId },
          select: {
            kind: true,
            title: true,
            numberingStyle: true,
            originalLabel: true,
            question: {
              select: {
                type: true,
                nickname: true,
                statementLatex: true,
                solutionLatex: true,
                complementLatex: true,
                originalLatex: true,
                difficulty: true,
                year: true,
                board: true,
                institution: true,
                role: true,
                roleLevel: true,
                publisher: true,
                videoUrl: true,
                sourceAnchorId: true,
                options: {
                  orderBy: { sortKey: "asc" },
                  select: {
                    sortKey: true,
                    statementLatex: true,
                    solutionLatex: true,
                    originalLatex: true,
                    isCorrect: true,
                    weight: true,
                  },
                },
                tags: { select: { tagId: true } },
              },
            },
          },
        });

        const isRoot = step.sourceId === rootPlan.sourceId;
        const { question } = source;

        const createdQuestion = question
          ? await tx.question.create({
              data: {
                ...question,
                status: "DRAFT",
                validationStatus: "UNVALIDATED",
                options: { create: question.options.map((option) => ({ ...option })) },
                tags: { create: question.tags.map((tag) => ({ tagId: tag.tagId })) },
              },
              select: { id: true },
            })
          : null;

        const created = await tx.documentNode.create({
          data: {
            publicationId,
            parentId: resolveParent(step, isRoot),
            kind: source.kind,
            title: isRoot && source.title ? `${source.title} (cópia)` : source.title,
            sortKey: step.sortKey,
            numberingStyle: source.numberingStyle,
            originalLabel: source.originalLabel,
            ...(createdQuestion ? { questionId: createdQuestion.id } : {}),
          },
          select: { id: true },
        });

        idMap.set(step.sourceId, created.id);
      }

      return idMap.get(rootPlan.sourceId) as string;
    });
  }
}

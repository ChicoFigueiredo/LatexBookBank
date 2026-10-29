import "server-only";

import type {
  DeletedNodeRecord,
  PlannedNode,
  DocumentTreeRepository,
  DocumentTreeWriter,
  NewNode,
  RestoredRoot,
  TreeNodeRecord,
} from "@modules/document-tree/domain/document-tree-repository";
import { isNodeKind, isNumberingStyle } from "@modules/document-tree/domain/node-kind";
import { insertNode } from "@modules/document-tree/infrastructure/prisma-node-writer";
import { isAnchorRole } from "@modules/assets/domain/node-anchors";
import { prisma } from "@infrastructure/database/sqlite/client";
import { inChunks } from "@infrastructure/database/sqlite/in-chunks";

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
        // A âncora principal do nó: com a última revisão, responde se o corpo é *a revisar*.
        sourceAnchor: { select: { extractionMethod: true } },
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
            validationStatus: true,
            status: true,
            sourceAnchor: { select: { extractionMethod: true } },
            // Só o **último** job, e só o estado: a árvore quer saber se o render quebrou, não
            // quantas vezes. Trazer a lista faria a abertura da publicação pagar pelo histórico
            // de compilação de cada questão.
            renderJobs: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { state: true },
            },
            options: {
              orderBy: { sortKey: "asc" },
              select: { id: true, sortKey: true, statementLatex: true, isCorrect: true },
            },
            // Só o nome: é o que a árvore desenha e filtra. Trazer o id obrigaria a uma segunda
            // consulta para descobrir o que mostrar.
            tags: { select: { tag: { select: { name: true } } } },
          },
        },
      },
    });

    /*
      O corpo *a revisar* (#252) precisa de dois fatos que a linha do nó não traz: se o corpo tem
      texto — sem carregar o texto de todos os corpos para desenhar a árvore — e a última revisão
      de cada nó. Duas consultas a mais, e nenhuma coluna nova (D40).
    */
    const withBody = new Set(
      (
        await prisma.documentNode.findMany({
          where: { publicationId, deletedAt: null, questionId: null, bodyLatex: { not: "" } },
          select: { id: true },
        })
      ).map((row) => row.id),
    );
    const lastRevision = new Map<string, { origin: string; summary: string }>();
    for (const ids of inChunks([...withBody])) {
      const revisions = await prisma.revision.findMany({
        where: { entityType: "DOCUMENT_NODE", entityId: { in: ids } },
        orderBy: { revisionNumber: "asc" },
        select: { entityId: true, origin: true, summary: true },
      });
      // Em ordem crescente, a última escrita de cada nó é a que fica no mapa.
      for (const { entityId, ...revision } of revisions) lastRevision.set(entityId, revision);
    }

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
        body: withBody.has(row.id)
          ? {
              hasBody: true,
              anchorMethod: row.sourceAnchor?.extractionMethod ?? null,
              lastRevision: lastRevision.get(row.id) ?? null,
            }
          : null,
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

  /**
   * Renomear e mover **não** mudam a versão do nó (#259).
   *
   * `updatedAt` é o token de concorrência do **corpo** (`saveNodeBody`), e o `@updatedAt` do Prisma
   * o avançaria aqui. Com o corpo aberto, renomear o capítulo na árvore ou arrastá-lo fazia o
   * autosave seguinte bater em 409 — sobre um texto que ninguém mais tinha tocado. Título e
   * posição são da árvore, não do corpo: o valor é regravado igual, na mesma transação.
   */
  async rename(nodeId: string, title: string | null): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const { updatedAt } = await tx.documentNode.findUniqueOrThrow({
        where: { id: nodeId },
        select: { updatedAt: true },
      });
      await tx.documentNode.update({ where: { id: nodeId }, data: { title, updatedAt } });
    });
  }

  async move(nodeId: string, parentId: string | null, sortKey: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const { updatedAt } = await tx.documentNode.findUniqueOrThrow({
        where: { id: nodeId },
        select: { updatedAt: true },
      });
      await tx.documentNode.update({
        where: { id: nodeId },
        data: { parentId, sortKey, updatedAt },
      });
    });
  }

  /**
   * Uma transação, não N updates.
   *
   * Marcar o pai e falhar no meio dos filhos deixaria a árvore com nós apontando para um pai
   * excluído — invisíveis e fora da lixeira. `updateMany` com `in` resolve num comando só.
   */
  async softDeleteMany(nodeIds: readonly string[]): Promise<void> {
    if (nodeIds.length === 0) return;
    // Em pedaços, na mesma transação e com o mesmo instante: uma subárvore grande passa do limite
    // de parâmetros do SQLite (`in-chunks.ts`), e a lixeira agrupa os atos pelo `deletedAt`.
    const deletedAt = new Date();
    await prisma.$transaction(async (tx) => {
      for (const ids of inChunks(nodeIds)) {
        await tx.documentNode.updateMany({ where: { id: { in: ids } }, data: { deletedAt } });
      }
    });
  }

  async restoreMany(nodeIds: readonly string[], root?: RestoredRoot): Promise<void> {
    if (nodeIds.length === 0) return;
    await prisma.$transaction(async (tx) => {
      for (const ids of inChunks(nodeIds)) {
        await tx.documentNode.updateMany({ where: { id: { in: ids } }, data: { deletedAt: null } });
      }
      if (!root) return;

      // Os irmãos vivos lidos aqui, e não no caso de uso: a chave nova vê o que foi gravado até
      // esta transação abrir (ACV-09).
      const { publicationId, parentId } = await tx.documentNode.findUniqueOrThrow({
        where: { id: root.nodeId },
        select: { publicationId: true, parentId: true },
      });
      const siblings = await tx.documentNode.findMany({
        where: { publicationId, parentId, deletedAt: null, id: { not: root.nodeId } },
        select: { sortKey: true },
      });
      const sortKey = root.sortKeyAmong(siblings.map((sibling) => sibling.sortKey));
      if (sortKey !== null) {
        await tx.documentNode.update({ where: { id: root.nodeId }, data: { sortKey } });
      }
    });
  }

  async listDeleted(publicationId: string): Promise<readonly DeletedNodeRecord[]> {
    const rows = await prisma.documentNode.findMany({
      where: { publicationId, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      select: { id: true, parentId: true, title: true, kind: true, sortKey: true, deletedAt: true },
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
        sortKey: row.sortKey,
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
   * - As âncoras, e com elas `sourceAnchorId` — a proveniência é do conteúdo, não da linha: as duas
   *   questões vieram do mesmo recorte, e D29 trata a fonte como imutável e compartilhável.
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
            // O corpo é a teoria da seção e o texto inteiro do exemplo (D56): sem ele, a cópia
            // nasce como um galho vazio (#252).
            bodyLatex: true,
            // As âncoras vão junto: a origem é do conteúdo (D50). A principal delas é o
            // `sourceAnchorId` da cópia, do nó e da questão.
            anchors: {
              orderBy: { sortOrder: "asc" },
              select: { sourceAnchorId: true, role: true },
            },
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

        const created = await insertNode(tx, {
          columns: {
            publicationId,
            parentId: resolveParent(step, isRoot),
            kind: source.kind,
            title: isRoot && source.title ? `${source.title} (cópia)` : source.title,
            sortKey: step.sortKey,
            numberingStyle: source.numberingStyle,
            originalLabel: source.originalLabel,
            bodyLatex: source.bodyLatex,
          },
          question: question
            ? {
                columns: {
                  type: question.type,
                  nickname: question.nickname,
                  statementLatex: question.statementLatex,
                  solutionLatex: question.solutionLatex,
                  complementLatex: question.complementLatex,
                  originalLatex: question.originalLatex,
                  difficulty: question.difficulty,
                  year: question.year,
                  board: question.board,
                  institution: question.institution,
                  role: question.role,
                  roleLevel: question.roleLevel,
                  publisher: question.publisher,
                  videoUrl: question.videoUrl,
                  status: "DRAFT",
                  validationStatus: "UNVALIDATED",
                },
                options: question.options.map((option) => ({ ...option })),
                tagIds: question.tags.map((tag) => tag.tagId),
              }
            : null,
          // A lista inteira, com os papéis: a principal dela volta às colunas do nó e da questão.
          anchors: source.anchors.map(({ sourceAnchorId, role }) => ({
            sourceAnchorId,
            role: isAnchorRole(role) ? role : "PRIMARY",
          })),
        });

        idMap.set(step.sourceId, created.nodeId);
      }

      return idMap.get(rootPlan.sourceId) as string;
    });
  }
}

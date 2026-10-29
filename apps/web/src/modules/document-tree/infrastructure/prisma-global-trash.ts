import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import { inChunks } from "@infrastructure/database/sqlite/in-chunks";
import type {
  TrashPurge,
  TrashPurgeTransaction,
} from "@modules/document-tree/application/empty-trash";
import {
  type AtoDeExclusao,
  type NoExcluido,
  agruparLixeira,
  contagemDoRodape,
  frasedoQueLevou,
  rotular,
} from "@modules/document-tree/domain/trash-grouping";
import type { TrashedNode } from "@modules/document-tree/domain/trash-purge";
import { asStorageKey } from "@/shared/ports";

/**
 * A lixeira de **todo** o acervo (protótipo, 1889–1921).
 *
 * O app tinha lixeira por publicação, e só se chegava a ela de dentro do livro. Isso resolve a
 * pergunta "o que apaguei neste livro" e não resolve a que faz alguém procurar a lixeira: "apaguei
 * alguma coisa, e não lembro onde". Quem não lembra o livro não tem por onde começar — precisaria
 * abrir os vinte e quatro.
 *
 * Read model, e não repositório: `listDeleted` é por publicação por bons motivos (o `restoreNode`
 * precisa dela assim), e alargá-la para o acervo inteiro faria toda restauração carregar o acervo.
 */

export interface ItemDaLixeira {
  readonly id: string;
  readonly publicationId: string;
  readonly title: string;
  readonly kind: string;
  /** "FME 1 › cap. 2" — onde estava, que é o que decide se vale restaurar. */
  readonly where: string;
  readonly libraryName: string;
  readonly deletedAt: Date;
  readonly restoresCount: number;
  /** "levou 6 questões com ele" — `null` quando não levou nada. */
  readonly took: string | null;
  /**
   * "Capítulo 2" — o pai que também está na lixeira, excluído depois deste item (#260). Enquanto
   * ele não voltar, este não volta; `null` quando o item pode ser restaurado já.
   */
  readonly waitsFor: string | null;
}

export interface LixeiraGlobal {
  readonly items: readonly ItemDaLixeira[];
  /** "2 itens · 8 objetos". */
  readonly footer: string;
  readonly itemCount: number;
  readonly objectCount: number;
}

export async function readGlobalTrash(): Promise<LixeiraGlobal> {
  const rows = await prisma.documentNode.findMany({
    where: { deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    select: {
      id: true,
      parentId: true,
      kind: true,
      title: true,
      originalLabel: true,
      deletedAt: true,
      questionId: true,
      publicationId: true,
      question: { select: { nickname: true } },
      publication: {
        select: { title: true, volume: true, workspace: { select: { name: true } } },
      },
    },
  });

  const nos: NoExcluido[] = rows.map((row) => ({
    id: row.id,
    parentId: row.parentId,
    kind: row.kind,
    title: row.title,
    originalLabel: row.originalLabel,
    deletedAt: row.deletedAt as Date,
    hasQuestion: row.questionId !== null,
    nickname: row.question?.nickname ?? null,
  }));

  const resumo = agruparLixeira(nos);
  const porId = new Map(rows.map((row) => [row.id, row]));
  const noPorId = new Map(nos.map((no) => [no.id, no]));

  // O caminho ("cap. 2") vem do pai, que existe no banco mesmo quando está na lixeira — o caso do
  // filho excluído antes dele, que é ato próprio (#260). A linha existe, e serve de endereço.
  const ancestrais = await carregarAncestrais(
    resumo.atos.map((ato) => porId.get(ato.id)?.parentId).filter((id): id is string => !!id),
  );

  return {
    items: resumo.atos.map((ato): ItemDaLixeira => {
      const row = porId.get(ato.id);
      const livro = row?.publication;
      const paiTitulo = row?.parentId ? ancestrais.get(row.parentId) : null;
      const paiNaLixeira = ato.paiNaLixeira ? noPorId.get(ato.paiNaLixeira) : undefined;

      return {
        id: ato.id,
        publicationId: row?.publicationId ?? "",
        title: ato.title,
        kind: ato.kind,
        where: [tituloDoLivro(livro), paiTitulo].filter(Boolean).join(" › "),
        libraryName: livro?.workspace.name ?? "",
        deletedAt: ato.deletedAt,
        restoresCount: ato.restoresCount,
        took: frasedoQueLevou(ato satisfies AtoDeExclusao),
        waitsFor: paiNaLixeira ? rotular(paiNaLixeira) : null,
      };
    }),
    footer: contagemDoRodape(resumo),
    itemCount: resumo.itemCount,
    objectCount: resumo.objectCount,
  };
}

/** "FME 1" — o volume entra no nome porque é o que distingue os seis volumes da mesma coleção. */
const tituloDoLivro = (
  livro: { title: string; volume: string | null } | null | undefined,
): string => {
  if (!livro) return "";
  const volume = livro.volume?.trim();

  return volume && !livro.title.includes(volume) ? `${livro.title} ${volume}` : livro.title;
};

async function carregarAncestrais(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  const rows = (
    await Promise.all(
      inChunks([...new Set(ids)]).map((chunk) =>
        prisma.documentNode.findMany({
          where: { id: { in: chunk } },
          select: { id: true, title: true, kind: true, originalLabel: true },
        }),
      ),
    )
  ).flat();

  return new Map(
    rows.map((row) => [
      row.id,
      row.title?.trim() ||
        (row.originalLabel?.trim() ? `${row.kind.toLowerCase()} ${row.originalLabel}` : ""),
    ]),
  );
}

/**
 * Esvaziar a lixeira — a única operação do produto que apaga de verdade.
 *
 * Só os fatos e a exclusão, numa transação: o que fica porque uma prova usa (#258) é decidido no
 * domínio (`planTrashPurge`), pelo caso de uso `emptyTrash` (D71).
 *
 * **A questão vai junto, e é o ponto todo.** `DocumentNode.questionId` aponta para `Question`, e
 * `Question` não tem cascade nesse sentido: apagar só o nó deixaria a questão viva, invisível em
 * qualquer tela e contando nos totais para sempre — um vazamento que cresce a cada esvaziada e que
 * ninguém veria, porque o sintoma é um número que não fecha.
 *
 * Nesta ordem: primeiro os nós (que referenciam a questão), depois as questões. `QuestionOption` e
 * `QuestionTag` saem por cascade declarado no schema, e o `RenderJob` também, levando as linhas dos
 * artefatos dele.
 *
 * O que fica de cada asset:
 * - **Artefato de render** é derivado (D29): a linha sai em cascata com o job, e o arquivo sai do
 *   disco quando nenhuma outra linha cita a mesma chave.
 * - **Asset fonte da questão** (figura, imagem) **fica**, com `questionId` nulo. É patrimônio
 *   (D29), e o `createAsset` deduplica pela chave: a linha que nasceu com esta questão pode ser a
 *   mesma figura que outra questão usa.
 * - O `SourceAnchor` **fica**. Não é conteúdo da questão: é a marca de onde no PDF ela foi
 *   recortada, e D29 trata a fonte como imutável e compartilhável — dois nós podem apontar para o
 *   mesmo recorte. Apagá-lo aqui destruiria a proveniência de uma questão que continua viva.
 */
export class PrismaTrashPurge implements TrashPurge {
  async transact<T>(run: (tx: TrashPurgeTransaction) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx) => run(purgeTransaction(tx)));
  }
}

function purgeTransaction(tx: Tx): TrashPurgeTransaction {
  return {
    async listTrashed() {
      const rows = await tx.documentNode.findMany({
        where: { deletedAt: { not: null } },
        select: {
          id: true,
          parentId: true,
          kind: true,
          title: true,
          originalLabel: true,
          deletedAt: true,
          questionId: true,
          question: { select: { nickname: true } },
        },
      });
      return rows.map((row): TrashedNode => ({
        id: row.id,
        parentId: row.parentId,
        kind: row.kind,
        title: row.title,
        originalLabel: row.originalLabel,
        deletedAt: row.deletedAt ?? new Date(0),
        hasQuestion: row.questionId !== null,
        nickname: row.question?.nickname ?? null,
        questionId: row.questionId,
      }));
    },

    assessmentsUsing: (questionIds) => assessmentsUsing(tx, questionIds),

    async deleteForever(nodeIds, questionIds) {
      // As chaves dos artefatos de render que saem em cascata com as questões — lidas antes,
      // porque depois da exclusão as linhas já não existem para dizer qual era o arquivo.
      const renderKeys = new Set<string>();
      for (const ids of inChunks(questionIds)) {
        const artifacts = await tx.asset.findMany({
          where: { renderJob: { questionId: { in: ids } } },
          select: { storageKey: true },
        });
        for (const artifact of artifacts) renderKeys.add(artifact.storageKey);
      }

      const { nodes, questions } = await deleteRows(tx, nodeIds, questionIds);

      const stillCited = new Set<string>();
      for (const chunk of inChunks([...renderKeys])) {
        const cited = await tx.asset.findMany({
          where: { storageKey: { in: chunk } },
          select: { storageKey: true },
        });
        for (const asset of cited) stillCited.add(asset.storageKey);
      }

      return {
        nodes,
        questions,
        orphanedKeys: [...renderKeys].filter((key) => !stillCited.has(key)).map(asStorageKey),
      };
    },
  };
}

/** O cliente dentro da transação. `prisma.$transaction` entrega um cliente restrito. */
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Questão → títulos das avaliações que a usam. Só entram as questões que alguma prova usa. */
async function assessmentsUsing(
  tx: Tx,
  questionIds: readonly string[],
): Promise<Map<string, readonly string[]>> {
  const titles = new Map<string, Set<string>>();

  for (const ids of inChunks(questionIds)) {
    const items = await tx.assessmentItem.findMany({
      where: { questionId: { in: ids } },
      select: {
        questionId: true,
        section: { select: { assessment: { select: { title: true } } } },
      },
    });
    for (const item of items) {
      const forQuestion = titles.get(item.questionId) ?? new Set<string>();
      forQuestion.add(item.section.assessment.title);
      titles.set(item.questionId, forQuestion);
    }
  }

  return new Map([...titles].map(([questionId, set]) => [questionId, [...set]]));
}

async function deleteRows(
  tx: Tx,
  nodeIds: readonly string[],
  questionIds: readonly string[],
): Promise<{ nodes: number; questions: number }> {
  // Um filho **vivo** de um nó excluído não deveria existir — a exclusão desce a subárvore —, mas
  // se existisse, apagar o pai deixaria a FK `parentId` apontando para o nada. Soltá-lo na raiz é
  // a escolha que preserva o dado; apagá-lo junto seria apagar o que ninguém mandou.
  // Em pedaços (`in-chunks.ts`): a lixeira depois de apagar a importação de um livro passa de mil
  // nós, e o SQLite recusa a lista inteira.
  for (const ids of inChunks(nodeIds)) {
    await tx.documentNode.updateMany({
      where: { parentId: { in: ids }, deletedAt: null },
      data: { parentId: null },
    });
  }

  let nodes = 0;
  for (const ids of inChunks(nodeIds))
    nodes += (await tx.documentNode.deleteMany({ where: { id: { in: ids } } })).count;
  let questions = 0;
  for (const ids of inChunks(questionIds))
    questions += (await tx.question.deleteMany({ where: { id: { in: ids } } })).count;

  return { nodes, questions };
}

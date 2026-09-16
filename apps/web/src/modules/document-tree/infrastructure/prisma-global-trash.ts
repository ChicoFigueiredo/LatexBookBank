import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import {
  type AtoDeExclusao,
  type NoExcluido,
  agruparLixeira,
  contagemDoRodape,
  frasedoQueLevou,
} from "@modules/document-tree/domain/trash-grouping";

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

  // O caminho ("cap. 2") vem do ancestral **vivo** mais próximo: o pai do que foi excluído não
  // está na lixeira — é essa a definição de ato —, então ele existe e serve de endereço.
  const ancestrais = await carregarAncestrais(
    resumo.atos.map((ato) => porId.get(ato.id)?.parentId).filter((id): id is string => !!id),
  );

  return {
    items: resumo.atos.map((ato): ItemDaLixeira => {
      const row = porId.get(ato.id);
      const livro = row?.publication;
      const paiTitulo = row?.parentId ? ancestrais.get(row.parentId) : null;

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

  const rows = await prisma.documentNode.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, title: true, kind: true, originalLabel: true },
  });

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
 * **A questão vai junto, e é o ponto todo.** `DocumentNode.questionId` aponta para `Question`, e
 * `Question` não tem cascade nesse sentido: apagar só o nó deixaria a questão viva, invisível em
 * qualquer tela e contando nos totais para sempre — um vazamento que cresce a cada esvaziada e que
 * ninguém veria, porque o sintoma é um número que não fecha.
 *
 * Numa transação, e nesta ordem: primeiro os nós (que referenciam a questão), depois as questões.
 * `QuestionOption`, `QuestionTag` e os assets da questão saem por cascade declarado no schema.
 *
 * O `SourceAnchor` **fica**. Não é conteúdo da questão: é a marca de onde no PDF ela foi recortada,
 * e D29 trata a fonte como imutável e compartilhável — dois nós podem apontar para o mesmo
 * recorte. Apagá-lo aqui destruiria a proveniência de uma questão que continua viva.
 */
export async function emptyGlobalTrash(): Promise<{ nodes: number; questions: number }> {
  const alvos = await prisma.documentNode.findMany({
    where: { deletedAt: { not: null } },
    select: { id: true, questionId: true },
  });

  if (alvos.length === 0) return { nodes: 0, questions: 0 };

  const nodeIds = alvos.map((alvo) => alvo.id);
  const questionIds = alvos
    .map((alvo) => alvo.questionId)
    .filter((id): id is string => id !== null);

  return prisma.$transaction(async (tx) => {
    // Um filho **vivo** de um nó excluído não deveria existir — a exclusão desce a subárvore —,
    // mas se existisse, apagar o pai deixaria a FK `parentId` apontando para o nada. Soltá-lo na
    // raiz é a escolha que preserva o dado; apagá-lo junto seria apagar o que ninguém mandou.
    await tx.documentNode.updateMany({
      where: { parentId: { in: nodeIds }, deletedAt: null },
      data: { parentId: null },
    });

    const nodes = await tx.documentNode.deleteMany({ where: { id: { in: nodeIds } } });
    const questions = await tx.question.deleteMany({ where: { id: { in: questionIds } } });

    return { nodes: nodes.count, questions: questions.count };
  });
}

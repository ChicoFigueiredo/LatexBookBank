/**
 * Quem pode entrar numa prova — a condição, sem tocar no cliente do banco.
 *
 * Mora num arquivo próprio pelo mesmo motivo do `prisma-question-search-where` (#181): o adaptador
 * importa o `PrismaClient` no topo, e um teste sobre a condição subiria uma conexão junto.
 *
 * Continua em `infrastructure/` porque o formato é vocabulário de consulta do Prisma; levá-lo ao
 * domínio seria o domínio conhecendo o motor pela porta dos fundos.
 *
 * Ver spec §20 · issue #187.
 */

export function candidatesWhere(
  workspaceId: string,
  assessmentId: string,
): Record<string, unknown> {
  return {
    node: {
      /** A prova monta com o acervo **da própria biblioteca** (#177). */
      publication: { workspaceId },
      /**
       * **Nada da lixeira.**
       *
       * A lista oferecia as questões de nós excluídos junto com as vivas — no acervo de
       * demonstração, quatro de oito. Uma prova montada com elas sai **impressa** com uma questão
       * que a pessoa acha ter excluído, e o erro só aparece na sala. É pior que o caso da busca
       * (#181), onde o beco sem saída ao menos não virava papel.
       */
      deletedAt: null,
    },
    /**
     * E nada que **já está** nesta prova.
     *
     * O botão "Acrescentar" delas devolvia `added: false, reason: "already"` — quer dizer, um botão
     * que não faz nada. Oferecer o gesto e recusá-lo depois ensina a desconfiar da lista inteira.
     */
    NOT: { assessmentItems: { some: { section: { assessmentId } } } },
  };
}

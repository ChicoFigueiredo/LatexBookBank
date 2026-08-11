import type { SearchQuery } from "@modules/questions/domain/search-query";

/**
 * O `where` da busca, montado — e **sem tocar no cliente do banco**.
 *
 * Mora num arquivo próprio por um motivo prático: o adaptador importa o `PrismaClient` no topo do
 * módulo, então qualquer teste que quisesse afirmar algo sobre o filtro subiria uma conexão junto.
 * Separado, a condição é uma função pura sobre um objeto — e é ela que carrega as decisões que
 * importam.
 *
 * Continua em `infrastructure/` e não em `domain/`: o formato do objeto é o vocabulário de consulta
 * do Prisma, e levá-lo para o domínio seria o domínio conhecendo o motor pela porta dos fundos.
 *
 * Ver spec §21 · issue #181.
 */

export function buildWhere(query: SearchQuery): Record<string, unknown> {
  /**
   * **A busca só enxerga questão pendurada num nó vivo** (#181).
   *
   * Sem esta condição ela devolvia duas coisas que nenhuma outra tela mostra:
   *
   * - **questão de nó excluído** — a árvore a esconde por `deletedAt`, e "excluído" precisa querer
   *   dizer a mesma coisa nos dois lugares. Clicar no resultado levava a um nó que a árvore não
   *   desenha, e a pessoa concluía que a busca mente;
   * - **questão órfã**, sem nó nenhum. Ela não tem dono: `Question` só alcança um workspace pelo
   *   nó → publicação → workspace. Sem nó, ela não é exportada, não é escopada pelo guarda da
   *   #175 e não aparece em tela alguma — só aqui. Mostrar dado que nenhuma outra tela sabe
   *   tratar é mostrar um beco sem saída.
   *
   * Uma condição cobre os dois: `is` não casa com relação nula, então a órfã cai fora junto.
   *
   * (Órfã existe porque apagar publicação não apaga as questões dela — o que fazer com esse
   * conteúdo é decisão de produto, registrada na issue. Aqui só se decide o que a busca mostra.)
   */
  const and: Record<string, unknown>[] = [{ node: { is: { deletedAt: null } } }];

  if (query.text !== "") {
    // Título, apelido e enunciado na mesma busca: quem procura "juros" não sabe nem se lembra em
    // qual campo a palavra está, e obrigá-lo a escolher transformaria uma busca em três.
    and.push({
      OR: [
        { nickname: { contains: query.text } },
        { statementLatex: { contains: query.text } },
        { node: { title: { contains: query.text } } },
      ],
    });
  }

  // Tags em `E`: cada uma vira uma condição própria. Um `in` faria `OU`, e "juros **e** simples"
  // é o que alguém quer dizer ao marcar duas tags (mesma regra do filtro da árvore).
  for (const tag of query.tags) {
    and.push({ tags: { some: { tag: { name: tag } } } });
  }

  if (query.boards.length > 0) and.push({ board: { in: [...query.boards] } });
  if (query.institutions.length > 0) and.push({ institution: { in: [...query.institutions] } });
  if (query.years.length > 0) and.push({ year: { in: [...query.years] } });
  if (query.types.length > 0) and.push({ type: { in: [...query.types] } });
  if (query.difficulties.length > 0) and.push({ difficulty: { in: [...query.difficulties] } });

  return { AND: and };
}

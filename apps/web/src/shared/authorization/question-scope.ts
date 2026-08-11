import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";

/**
 * O guarda central: **a URL precisa ser verdade**.
 *
 * As rotas de questão têm a forma `/publications/:id/questions/:questionId`, e até a #175 o
 * primeiro segmento era **decorativo** — nenhuma delas o lia. Dava para ler e **gravar** uma
 * questão através de uma publicação qualquer, inclusive uma que não existe:
 *
 * ```
 * PATCH /api/publications/00000000-0000-4000-8000-000000000000/questions/<real>  →  200
 * ```
 *
 * O isolamento por `workspaceId` que a Fase 17 afirma existe no **schema**, e um guarda varre o
 * banco para provar que toda entidade alcança um workspace. O que não existia era a checagem no
 * caminho de entrada: com duas bibliotecas, uma questão da primeira é alcançável por uma
 * publicação da segunda, e o produto não percebe.
 *
 * Hoje isso é um dono só e um erro difícil de cometer sem querer. É justamente por isso que vale
 * fechar agora: quando houver dois donos, este é o furo que ninguém lembra de ter deixado.
 *
 * ## Por que resolver em vez de só validar
 *
 * A função devolve o `workspaceId` porque quem chama precisa dele de qualquer jeito — é o prefixo
 * do storage e o escopo do cache de render. Uma função que só dissesse "pode" obrigaria cada rota
 * a buscar a mesma cadeia de novo, e a segunda busca é onde as duas versões divergem.
 *
 * Ver spec §24 · §42 · planejamento §8 Fase 17 · issue #175.
 */

export interface QuestionScope {
  readonly questionId: string;
  readonly publicationId: string;
  /** O dono. Prefixo do storage, escopo do cache — quem chama precisa dele. */
  readonly workspaceId: string;
}

/**
 * Resolve a cadeia questão → nó → publicação → workspace, **conferindo** a publicação da URL.
 *
 * `null` quando a questão não existe **ou** não é daquela publicação. Os dois casos viram 404 na
 * rota, e de propósito: distinguir "existe, mas não é sua" de "não existe" conta a quem perguntou
 * que o id acertou — que é a informação que um enumerador procura.
 */
export async function resolveQuestionScope(
  publicationId: string,
  questionId: string,
): Promise<QuestionScope | null> {
  const row = await prisma.question.findFirst({
    // A condição está **na consulta**, não num `if` depois de ler: ler e depois comparar deixa a
    // janela onde alguém acrescenta um caminho novo e esquece a comparação.
    where: { id: questionId, node: { publicationId } },
    select: {
      id: true,
      node: { select: { publicationId: true, publication: { select: { workspaceId: true } } } },
    },
  });

  if (row === null || row.node === null) return null;

  return {
    questionId: row.id,
    publicationId: row.node.publicationId,
    workspaceId: row.node.publication.workspaceId,
  };
}

/**
 * Onde a questão mora, na linha do resultado da busca (protótipo, 2190).
 *
 * No domínio e não na infraestrutura, pela mesma razão de `shelf-labels` e `separar-alternativas`:
 * é regra de rótulo, é pura, e é a coisa mais fácil de errar em silêncio numa lista de cinquenta
 * resultados. Aqui ela tem teste — e importá-la de dentro do repositório Prisma arrastaria o
 * cliente do banco para o teste unitário só para formatar uma string.
 */

export interface LocalizacaoDaQuestao {
  readonly publication: { readonly title: string; readonly nickname: string | null };
  readonly parent: {
    readonly title: string | null;
    readonly originalLabel: string | null;
    readonly kind: string;
  } | null;
}

/**
 * "FME 1 › Capítulo 2" — o livro e o pai imediato.
 *
 * O apelido do livro vem primeiro quando existe: numa lista de resultados de meia dúzia de volumes
 * da mesma coleção, "FME 1" distingue e "Fundamentos de Matemática Elementar" não — repetido cinco
 * vezes, o título da capa vira ruído idêntico.
 *
 * Só o pai imediato, e não o caminho inteiro: subir a árvore por questão seria cinquenta escaladas
 * para uma linha que precisa caber numa palete. Livro e capítulo respondem "de onde é isto?"; o
 * endereço completo quem dá é abrir.
 *
 * O pai entra só quando tem nome. Um `QUESTION_GROUP` sem título não acrescenta nada a
 * "› Sem título", e a linha fica melhor sem ele.
 */
export function caminhoDe(node: LocalizacaoDaQuestao | null): string | null {
  if (node === null) return null;

  const livro = node.publication.nickname?.trim() || node.publication.title;
  const pai =
    node.parent?.title?.trim() ||
    (node.parent?.originalLabel?.trim()
      ? `${node.parent.kind === "CHAPTER" ? "Capítulo" : "Seção"} ${node.parent.originalLabel}`
      : null);

  return pai ? `${livro} › ${pai}` : livro;
}

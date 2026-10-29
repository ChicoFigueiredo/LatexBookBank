/**
 * Quando um nó da lixeira pode voltar sozinho.
 *
 * Não pode quando o pai também está na lixeira: ele voltaria apontando para um pai invisível,
 * sumiria da árvore de novo, e a pessoa concluiria que a restauração falhou sem nada dizer.
 *
 * Uma regra, dois usos: o `restoreNode` a aplica, e a lixeira do livro a mostra antes do clique.
 * A rota da lixeira tinha uma cópia dela num `if` (STE-11); se a regra mudasse num lado só, o botão
 * passaria a mentir.
 */

/** O ancestral excluído que impede a volta, ou `null` quando o nó pode voltar. */
export function deletedAncestorOf(
  node: { readonly parentId: string | null },
  deleted: { has(id: string): boolean },
): string | null {
  return node.parentId !== null && deleted.has(node.parentId) ? node.parentId : null;
}

export const isRestorable = (
  node: { readonly parentId: string | null },
  deleted: { has(id: string): boolean },
): boolean => deletedAncestorOf(node, deleted) === null;

import type { TreeNodeRecord } from "./document-tree-repository";

/**
 * Monta a hierarquia a partir da lista achatada.
 *
 * Regra de domínio, testável sem banco. Duas decisões que evitam falha silenciosa:
 *
 *   - **Nó órfão vira raiz.** Um `parentId` que não existe na lista significa dado inconsistente
 *     — no acervo legado isso acontece. Descartar o nó perderia conteúdo em silêncio; promovê-lo
 *     a raiz mantém tudo visível e deixa o problema aparente para quem olha a árvore.
 *   - **Ciclo é interrompido, não seguido.** `a → b → a` derrubaria a renderização por
 *     recursão infinita; aqui o segundo encontro do nó o trata como raiz.
 */

export interface TreeNode<T extends TreeNodeRecord = TreeNodeRecord> {
  readonly node: T;
  readonly children: readonly TreeNode<T>[];
  /** 0 para as raízes. Útil para indentação sem recalcular na renderização. */
  readonly depth: number;
}

export function buildTree<T extends TreeNodeRecord>(records: readonly T[]): readonly TreeNode<T>[] {
  const byId = new Map<string, T>(records.map((record) => [record.id, record]));
  const childrenOf = new Map<string | null, T[]>();

  for (const record of records) {
    const parentExists = record.parentId !== null && byId.has(record.parentId);
    const key = parentExists ? record.parentId : null;
    const siblings = childrenOf.get(key) ?? [];
    siblings.push(record);
    childrenOf.set(key, siblings);
  }

  for (const siblings of childrenOf.values()) {
    siblings.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }

  const visited = new Set<string>();

  const attach = (record: T, depth: number): TreeNode<T> => {
    visited.add(record.id);
    const children = (childrenOf.get(record.id) ?? [])
      .filter((child) => !visited.has(child.id))
      .map((child) => attach(child, depth + 1));

    return { node: record, children, depth };
  };

  const roots = (childrenOf.get(null) ?? []).map((root) => attach(root, 0));

  // Um ciclo fechado — `a → b → a`, sem nenhum nó apontando para fora dele — não tem raiz, e
  // portanto seria inalcançável a partir daqui: os nós sumiriam da árvore inteiros. Promover o
  // primeiro não visitado a raiz devolve o conjunto à superfície, onde o problema fica visível.
  for (const record of records) {
    if (!visited.has(record.id)) roots.push(attach(record, 0));
  }

  return roots;
}

/** Percorre a árvore em ordem de exibição. */
export function* walkTree<T extends TreeNodeRecord>(
  nodes: readonly TreeNode<T>[],
): Generator<TreeNode<T>> {
  for (const node of nodes) {
    yield node;
    yield* walkTree(node.children);
  }
}

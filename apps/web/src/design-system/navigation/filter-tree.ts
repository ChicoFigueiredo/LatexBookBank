import type { TreeNode } from "./Tree";

/**
 * Filtro de árvore que **preserva o caminho**.
 *
 * Um resultado de busca solto não diz nada: "Questão 3" existe em dezenas de capítulos, e o que
 * responde qual delas é o ramo acima. Por isso um nó que casa arrasta os ancestrais junto, mesmo
 * que eles não casem — eles entram como contexto, não como resultado.
 *
 * Descendentes de um nó que casa **não** vêm junto. É filtro, não navegação: se o capítulo casou
 * e o filho não, mostrar o filho encheria a lista com o que não foi procurado. Limpar a busca
 * devolve a árvore inteira.
 */

const fold = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export interface FilterTreeResult {
  readonly nodes: readonly TreeNode[];
  /** Ancestrais dos resultados. A árvore precisa abri-los, ou o filtro mostraria só as raízes. */
  readonly expanded: readonly string[];
  readonly matchCount: number;
}

export interface FilterTreeOptions {
  readonly query?: string;
  /** Predicado extra — tipo do nó, estado, o que for. Combina com a busca por **E**. */
  readonly predicate?: (node: TreeNode) => boolean;
  /** Como extrair o texto de um `label` que não é string. */
  readonly textOf?: (node: TreeNode) => string;
}

const defaultTextOf = (node: TreeNode): string =>
  typeof node.label === "string" ? node.label : "";

export function filterTree(
  nodes: readonly TreeNode[],
  { query = "", predicate, textOf = defaultTextOf }: FilterTreeOptions = {},
): FilterTreeResult {
  const needle = fold(query.trim());
  if (needle === "" && !predicate) {
    return { nodes, expanded: [], matchCount: 0 };
  }

  const expanded: string[] = [];
  let matchCount = 0;

  const matches = (node: TreeNode): boolean => {
    if (needle !== "" && !fold(textOf(node)).includes(needle)) return false;
    if (predicate && !predicate(node)) return false;
    return true;
  };

  const walk = (list: readonly TreeNode[]): TreeNode[] => {
    const kept: TreeNode[] = [];

    for (const node of list) {
      const keptChildren = node.children ? walk(node.children) : [];
      const hit = matches(node);

      if (hit) matchCount += 1;
      if (!hit && keptChildren.length === 0) continue;

      // O nó entra por ter casado ou por carregar quem casou. No segundo caso ele é caminho, e
      // precisa aparecer aberto — senão o resultado fica escondido atrás de um caret fechado.
      if (keptChildren.length > 0) expanded.push(node.id);

      kept.push({ ...node, children: keptChildren });
    }

    return kept;
  };

  return { nodes: walk(nodes), expanded, matchCount };
}

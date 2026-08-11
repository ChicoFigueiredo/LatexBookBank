import type { NodeKind } from "./node-kind";
import type { Placement } from "./tree-mutations";

/**
 * Onde o próximo item entra, dado o que está selecionado.
 *
 * Centralizado aqui porque a §72 do prompt do time é explícita: não espalhar cálculo de pai e
 * posição pela UI. A regra é uma só, e ela precisa dar a mesma resposta no menu `+ Adicionar`, no
 * menu de contexto e no destino de uma captura aprovada — três telas que, decidindo cada uma por
 * conta própria, divergiriam no primeiro caso de borda.
 *
 * A regra: **contêiner recebe dentro, folha recebe ao lado**. Criar um capítulo "dentro" de uma
 * questão não é hierarquia que o produto reconhece, e criar uma questão ao lado do capítulo
 * selecionado ignoraria o gesto de ter aberto o capítulo.
 */

const CONTAINERS: ReadonlySet<NodeKind> = new Set<NodeKind>([
  "BOOK",
  "PART",
  "CHAPTER",
  "SECTION",
  "SUBSECTION",
  "QUESTION_GROUP",
]);

export const isContainerKind = (kind: NodeKind): boolean => CONTAINERS.has(kind);

export function placementForAdd(selected: {
  readonly id: string;
  readonly kind: NodeKind;
} | null): Placement {
  // Sem seleção, o item vai para o fim da raiz: é onde o próximo capítulo de um livro entra, e é
  // o único destino que existe numa publicação ainda vazia.
  if (!selected) return { kind: "lastChild", parentId: null };

  return isContainerKind(selected.kind)
    ? { kind: "lastChild", parentId: selected.id }
    : { kind: "after", siblingId: selected.id };
}

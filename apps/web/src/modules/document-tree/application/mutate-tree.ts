import type {
  DeletedNodeRecord,
  DocumentTreeRepository,
  DocumentTreeWriter,
} from "@modules/document-tree/domain/document-tree-repository";
import { generateKeyBetween } from "@/shared/ordering/fractional-index";
import type { NodeKind } from "@modules/document-tree/domain/node-kind";
import {
  NodeNotFoundError,
  assertMoveIsLegal,
  collectSubtree,
  planDuplicate,
  resolvePlacement,
  type Placement,
} from "@modules/document-tree/domain/tree-mutations";

/**
 * Use cases de edição da árvore.
 *
 * Cada um segue a mesma forma: lê o estado atual, deixa o **domínio** decidir, e só então grava.
 * A decisão nunca acontece no repository nem no Route Handler — é o que permite testar ciclo,
 * posição e ordem com um repositório em memória, e o que faz a regra sobreviver à troca de motor
 * na Fase 6.5.
 */

export class DeletedAncestorError extends Error {
  constructor(
    readonly nodeId: string,
    readonly ancestorId: string,
  ) {
    super(
      `Não dá para restaurar ${nodeId}: o ancestral ${ancestorId} continua excluído. ` +
        `Restaure o ancestral primeiro, ou o nó voltaria invisível.`,
    );
    this.name = "DeletedAncestorError";
  }
}

interface Deps {
  readonly reader: DocumentTreeRepository;
  readonly writer: DocumentTreeWriter;
}

export interface CreateNodeCommand {
  readonly publicationId: string;
  readonly kind: NodeKind;
  readonly title: string | null;
  readonly placement: Placement;
}

export async function createNode(
  { reader, writer }: Deps,
  command: CreateNodeCommand,
): Promise<string> {
  const records = await reader.listByPublication(command.publicationId);
  const { parentId, sortKey } = resolvePlacement(records, command.placement);

  return writer.create({
    publicationId: command.publicationId,
    parentId,
    kind: command.kind,
    title: command.title,
    sortKey,
  });
}

export async function renameNode(
  { reader, writer }: Deps,
  publicationId: string,
  nodeId: string,
  title: string | null,
): Promise<void> {
  const records = await reader.listByPublication(publicationId);
  if (!records.some((record) => record.id === nodeId)) throw new NodeNotFoundError(nodeId);

  await writer.rename(nodeId, title);
}

/**
 * Move um nó — para outro pai, para outra posição, ou ambos.
 *
 * A verificação de ciclo vem **antes** de qualquer escrita e usa o estado lido nesta chamada. Sob
 * concorrência real isso é uma janela: dois movimentos simultâneos poderiam, em tese, fechar um
 * ciclo que nenhum dos dois viu sozinho. É single-user local hoje (D21); quando deixar de ser, o
 * lugar de fechar a janela é a transação do writer, não aqui.
 */
export async function moveNode(
  { reader, writer }: Deps,
  publicationId: string,
  nodeId: string,
  placement: Placement,
): Promise<void> {
  const records = await reader.listByPublication(publicationId);

  const target = resolvePlacement(records, placement, nodeId);
  assertMoveIsLegal(records, nodeId, target.parentId);

  await writer.move(nodeId, target.parentId, target.sortKey);
}

/**
 * Exclusão lógica do nó **e de toda a descendência**.
 *
 * Excluir só o pai deixaria os filhos apontando para um nó excluído: eles sumiriam da árvore sem
 * estar marcados como excluídos, não apareceriam na lixeira, e voltariam sozinhos se alguém
 * restaurasse o pai. A subárvore inteira é marcada de uma vez, numa transação.
 */
export async function deleteNode(
  { reader, writer }: Deps,
  publicationId: string,
  nodeId: string,
): Promise<readonly string[]> {
  const records = await reader.listByPublication(publicationId);
  if (!records.some((record) => record.id === nodeId)) throw new NodeNotFoundError(nodeId);

  const subtree = collectSubtree(records, nodeId);
  await writer.softDeleteMany(subtree);
  return subtree;
}

/**
 * Restaura um nó excluído, com a descendência que foi excluída **junto** com ele.
 *
 * Se o pai continuar excluído, **recusa** em vez de restaurar: o nó voltaria apontando para um
 * pai invisível, sumiria da árvore de novo e o usuário concluiria que a restauração falhou sem
 * dizer nada. A mensagem nomeia o ancestral que precisa vir antes.
 *
 * "Junto" é o mesmo `deletedAt` (#260): a exclusão grava um instante só para a subárvore inteira.
 * Um filho que já estava na lixeira quando o pai foi excluído é **outro ato** — alguém o excluiu de
 * propósito, antes — e não volta de carona: continua na lixeira, e é restaurado à parte depois do
 * pai. É a mesma regra que a lixeira usa para agrupar os atos (`agruparLixeira`).
 *
 * A sortKey de antes volta, para o nó voltar ao lugar de origem — menos quando um irmão criado
 * enquanto ele estava na lixeira recebeu a mesma chave. Dois irmãos com a mesma chave deixam a
 * ordem por conta do banco, e qualquer inserção entre eles cai em `generateKeyBetween(k, k)`.
 */
export async function restoreNode(
  { reader, writer }: Deps,
  publicationId: string,
  nodeId: string,
): Promise<readonly string[]> {
  const deleted = await writer.listDeleted(publicationId);
  const byId = new Map<string, DeletedNodeRecord>(deleted.map((record) => [record.id, record]));

  const node = byId.get(nodeId);
  if (!node) throw new NodeNotFoundError(nodeId);

  if (node.parentId !== null && byId.has(node.parentId)) {
    throw new DeletedAncestorError(nodeId, node.parentId);
  }

  const instante = node.deletedAt.getTime();
  const childrenOf = new Map<string | null, string[]>();
  for (const record of deleted) {
    if (record.deletedAt.getTime() !== instante) continue;
    const list = childrenOf.get(record.parentId);
    if (list) list.push(record.id);
    else childrenOf.set(record.parentId, [record.id]);
  }

  const restoring: string[] = [];
  const pending = [nodeId];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const id = pending.pop();
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    restoring.push(id);
    for (const child of childrenOf.get(id) ?? []) pending.push(child);
  }

  const siblings = (await reader.listByPublication(publicationId))
    .filter((record) => record.parentId === node.parentId)
    .map((record) => record.sortKey)
    .sort();

  if (siblings.includes(node.sortKey)) {
    // Logo depois do irmão que tomou a chave: é o lugar mais perto do de origem que está livre.
    const next = siblings.find((key) => key > node.sortKey) ?? null;
    await writer.restoreMany(restoring, {
      nodeId,
      sortKey: generateKeyBetween(node.sortKey, next),
    });
  } else {
    await writer.restoreMany(restoring);
  }

  return restoring;
}

/**
 * Duplica um nó e tudo abaixo dele.
 *
 * O domínio decide **onde** a cópia entra e em que ordem os nós nascem; a infraestrutura resolve
 * os ids e copia o conteúdo, numa transação. A separação não é cerimônia: é o que permite testar
 * o plano — pré-ordem, posição da raiz, ordem relativa dos filhos — sem banco.
 */
export async function duplicateNode(
  { reader, writer }: Deps,
  publicationId: string,
  nodeId: string,
  placement: Placement,
): Promise<string> {
  const records = await reader.listByPublication(publicationId);
  const plan = planDuplicate(records, nodeId, placement);

  return writer.duplicateSubtree(publicationId, plan);
}

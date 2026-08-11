import { displayName, tagKey, type TagSuggestion } from "../domain/tag";

/**
 * Marcar e desmarcar tags numa questão.
 *
 * A regra que importa aqui é de **reuso**: aplicar uma tag que já existe no workspace tem de
 * reaproveitar a existente, e não criar uma segunda com outra grafia. Sem isso, o filtro por tag
 * começa a mentir depois do primeiro mês de uso.
 */

export interface TagRecord {
  readonly id: string;
  readonly name: string;
}

export interface TagRepository {
  /** Todas as tags do workspace, com contagem de uso. É por workspace: são 13 bibliotecas. */
  listTags(workspaceId: string): Promise<readonly TagSuggestion[]>;
  createTag(workspaceId: string, name: string): Promise<TagRecord>;
  attach(questionId: string, tagId: string): Promise<void>;
  detach(questionId: string, tagId: string): Promise<void>;
  listQuestionTags(questionId: string): Promise<readonly TagRecord[]>;
}

/**
 * Aplica uma tag pelo nome, criando só se ela não existir.
 *
 * A busca é pela **chave**, não pelo nome: é ela que sabe que "funcao quadratica" e "Função
 * Quadrática" são a mesma coisa. Procurar pelo nome cru criaria a segunda em silêncio.
 */
export async function tagQuestion(
  repository: TagRepository,
  workspaceId: string,
  questionId: string,
  rawName: string,
): Promise<TagRecord> {
  const name = displayName(rawName);
  const key = tagKey(name);

  const existing = (await repository.listTags(workspaceId)).find((tag) => tagKey(tag.name) === key);
  const tag = existing ?? (await repository.createTag(workspaceId, name));

  await repository.attach(questionId, tag.id);
  return { id: tag.id, name: tag.name };
}

export async function untagQuestion(
  repository: TagRepository,
  questionId: string,
  tagId: string,
): Promise<void> {
  // Sem checar se estava aplicada: desmarcar o que já está desmarcado dá o mesmo resultado, e
  // exigir a leitura antes só acrescentaria uma ida ao banco para às vezes recusar um clique
  // duplo — que é o gesto, não o erro.
  await repository.detach(questionId, tagId);
}

/**
 * Aplica várias de uma vez, como quem cola uma lista.
 *
 * Sequencial e não em paralelo: duas tags novas com a mesma chave numa mesma colagem criariam
 * duas linhas se fossem resolvidas ao mesmo tempo. `dedupeTagNames` já tira as repetidas óbvias,
 * mas é a ordem que garante que a segunda enxergue a primeira.
 */
export async function tagQuestionMany(
  repository: TagRepository,
  workspaceId: string,
  questionId: string,
  names: readonly string[],
): Promise<TagRecord[]> {
  const applied: TagRecord[] = [];
  for (const name of names) {
    applied.push(await tagQuestion(repository, workspaceId, questionId, name));
  }
  return applied;
}

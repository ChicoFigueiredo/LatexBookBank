import {
  DuplicateLibraryError,
  LibraryConfirmationMismatchError,
  LibraryNotFoundError,
  matchesLibraryName,
  normalizeLibraryDescription,
  normalizeLibraryName,
  slugifyLibrary,
  uniqueSlug,
} from "@modules/workspaces/domain/library";
import type {
  LibraryContents,
  LibrarySummary,
  LibraryRepository,
} from "@modules/workspaces/domain/library-repository";
import { asStorageKey, type StorageProvider } from "@/shared/ports";

/**
 * Criar e renomear bibliotecas — a primeira ação real do Beta Editorial.
 *
 * Antes disto, uma biblioteca só nascia por `db:seed` ou por import legado, e a Home falava de um
 * workspace `demo` que ninguém tinha pedido. O que muda para quem usa: dá para começar do zero.
 *
 * **Nome repetido é aviso, não recusa** — é o que o protótipo do Beta Editorial define, e ele é o
 * contrato. A versão anterior devolvia 409, com o argumento de que duas bibliotecas homônimas
 * seriam indistinguíveis na tela. O argumento continua verdadeiro; o que mudou foi quem decide:
 * quem tem "Concursos 2025" em duas máquinas e importa as duas tem um motivo legítimo, e recusar
 * transformava um caso real num beco. A proteção contra o engano não sumiu — virou o aviso que o
 * diálogo mostra **enquanto se digita**, antes de salvar. O slug continua desambiguado por
 * `uniqueSlug`, então as URLs seguem distintas.
 */

export async function createLibrary(
  repository: LibraryRepository,
  input: { readonly name: unknown; readonly description?: unknown },
): Promise<LibrarySummary> {
  const name = normalizeLibraryName(input.name);
  const description = normalizeLibraryDescription(input.description);

  const slug = uniqueSlug(slugifyLibrary(name), await repository.listSlugs());
  return repository.create({ name, slug, description });
}

/**
 * Renomear preserva o slug.
 *
 * O slug já está em URLs guardadas, em `.lbb` exportado e na chave de storage dos assets. Recalculá-lo
 * a cada renome quebraria links por uma correção de digitação no título.
 */
export async function renameLibrary(
  repository: LibraryRepository,
  id: string,
  rawName: unknown,
): Promise<LibrarySummary> {
  const name = normalizeLibraryName(rawName);

  const current = await repository.findById(id);
  if (!current) throw new LibraryNotFoundError(id);

  // Renomear para o mesmo nome não é duplicata — é um no-op que a checagem ingênua recusaria.
  if (current.name !== name && (await repository.existsByName(name))) {
    throw new DuplicateLibraryError(name);
  }

  const renamed = await repository.rename(id, name);
  if (!renamed) throw new LibraryNotFoundError(id);
  return renamed;
}

/**
 * Excluir biblioteca — **permanente**, e por isso confirmada digitando o nome.
 *
 * Não é lixeira. A exclusão lógica do produto é a dos nós de um livro, onde o arrependimento é
 * comum e a restauração devolve a árvore inteira; uma biblioteca é a unidade de cima, e mantê-la
 * meio-viva significaria filtrar `deletedAt` em toda listagem, todo export e toda busca — custo
 * permanente por um caso raro. Aqui o pedido de perdão é o backup `.lbb`, que existe justamente
 * para isso.
 *
 * **A ordem importa.** O arquivo sai depois do banco: se a remoção do storage falhar no meio, o
 * que sobra é arquivo órfão — invisível e recuperável com uma varredura. Na ordem inversa, o que
 * sobraria era linha apontando para arquivo que não existe mais, e aí a tela quebra ao abrir.
 *
 * Devolve o que foi apagado, para a tela poder dizer.
 */
export async function deleteLibrary(
  repository: LibraryRepository,
  storage: StorageProvider,
  id: string,
  confirmation: { readonly name: unknown },
): Promise<LibraryContents & { readonly name: string }> {
  const library = await repository.findById(id);
  if (!library) throw new LibraryNotFoundError(id);

  if (!matchesLibraryName(confirmation.name, library.name)) {
    throw new LibraryConfirmationMismatchError(library.name);
  }

  const contents = (await repository.contentsOf(id)) ?? {
    publicationCount: 0,
    questionCount: 0,
    assetCount: 0,
  };
  const keys = await repository.listAssetKeys(id);

  if (!(await repository.delete(id))) throw new LibraryNotFoundError(id);

  // Best-effort, e de propósito: o banco já não referencia nenhum destes arquivos. Derrubar a
  // resposta por um arquivo que o antivírus prendeu faria a tela dizer "não deu para excluir"
  // sobre uma biblioteca que já não existe.
  await Promise.all(keys.map((key) => storage.delete(asStorageKey(key)).catch(() => undefined)));

  return { ...contents, name: library.name };
}

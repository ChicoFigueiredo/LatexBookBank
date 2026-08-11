import {
  DuplicateLibraryError,
  LibraryNotFoundError,
  normalizeLibraryName,
  slugifyLibrary,
  uniqueSlug,
} from "@modules/workspaces/domain/library";
import type { LibrarySummary, LibraryRepository } from "@modules/workspaces/domain/library-repository";

/**
 * Criar e renomear bibliotecas — a primeira ação real do Beta Editorial.
 *
 * Antes disto, uma biblioteca só nascia por `db:seed` ou por import legado, e a Home falava de um
 * workspace `demo` que ninguém tinha pedido. O que muda para quem usa: dá para começar do zero.
 *
 * O nome duplicado é **recusado**, não desambiguado. Duas bibliotecas com o mesmo nome e slugs
 * diferentes seriam indistinguíveis na tela — e a tela é onde a escolha acontece.
 */

export async function createLibrary(
  repository: LibraryRepository,
  input: { readonly name: unknown },
): Promise<LibrarySummary> {
  const name = normalizeLibraryName(input.name);

  if (await repository.existsByName(name)) throw new DuplicateLibraryError(name);

  const slug = uniqueSlug(slugifyLibrary(name), await repository.listSlugs());
  return repository.create({ name, slug });
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

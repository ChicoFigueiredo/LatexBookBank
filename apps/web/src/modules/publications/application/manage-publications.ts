import {
  matchesPublicationTitle,
  parsePublicationDraft,
  PublicationConfirmationMismatchError,
  type PublicationDraftInput,
} from "@modules/publications/domain/publication-draft";
import type {
  PublicationContents,
  PublicationDetail,
  PublicationRepository,
} from "@modules/publications/domain/publication-repository";
import { asStorageKey, type StorageProvider } from "@/shared/ports";
import { LibraryNotFoundError } from "@modules/workspaces/domain/library";
import type { LibraryRepository } from "@modules/workspaces/domain/library-repository";

/**
 * Cadastrar e editar um livro à mão.
 *
 * O caminho manual precisa ficar tão claro quanto o do Calibre (design §5) — e ele vem primeiro,
 * porque é o único que funciona sem nenhuma dependência externa. Quem não tem Calibre instalado
 * ainda consegue montar o acervo.
 */

export class PublicationNotFoundError extends Error {
  constructor(readonly id: string) {
    super(`Publicação ${id} não existe.`);
    this.name = "PublicationNotFoundError";
  }
}

interface Deps {
  readonly publications: PublicationRepository;
  readonly libraries: LibraryRepository;
}

export async function createPublication(
  { publications, libraries }: Deps,
  libraryId: string,
  input: PublicationDraftInput,
  maxYear: number,
): Promise<PublicationDetail> {
  // A biblioteca é conferida **antes** de validar o formulário? Não: o erro de formulário é o que
  // o autor consegue corrigir, e mostrá-lo primeiro evita que ele descubra o campo errado só
  // depois de resolver um problema que não era dele. A biblioteca inexistente é bug de rota.
  const draft = parsePublicationDraft(input, maxYear);

  const library = await libraries.findById(libraryId);
  if (!library) throw new LibraryNotFoundError(libraryId);

  return publications.create(libraryId, draft);
}

export async function updatePublication(
  { publications }: Deps,
  id: string,
  input: PublicationDraftInput,
  maxYear: number,
): Promise<PublicationDetail> {
  const draft = parsePublicationDraft(input, maxYear);

  const updated = await publications.update(id, draft);
  if (!updated) throw new PublicationNotFoundError(id);
  return updated;
}

/**
 * Excluir um livro — a segunda operação sem volta do produto.
 *
 * Não existia. Dava para excluir a **biblioteca** inteira, com confirmação por nome digitado, e
 * dava para mandar nó e questão para a lixeira. Um livro importado por engano — a entrada errada do
 * Calibre, a duplicata que só aparece depois — ficava no acervo para sempre, e a única saída era
 * apagar a biblioteca em volta dele.
 *
 * Segue o padrão da biblioteca, e não o da lixeira, por uma razão de forma: a lixeira é de
 * `DocumentNode` — tem `deletedAt` na tabela dos nós, e nada equivalente na publicação. Fingir uma
 * lixeira de livros exigiria coluna nova; o que existe hoje, e é honesto, é a mesma cerimônia da
 * biblioteca — título digitado de volta, e o aviso do que vai junto com números buscados.
 */
export async function deletePublication(
  repository: PublicationRepository,
  storage: StorageProvider,
  id: string,
  confirmation: { readonly title: unknown },
): Promise<PublicationContents & { readonly title: string }> {
  const publication = await repository.findById(id);
  if (!publication) throw new PublicationNotFoundError(id);

  if (!matchesPublicationTitle(confirmation.title, publication.title)) {
    throw new PublicationConfirmationMismatchError(publication.title);
  }

  const contents = (await repository.contentsOf(id)) ?? {
    questionCount: 0,
    nodeCount: 0,
    assetCount: 0,
    anchorCount: 0,
  };
  const keys = await repository.listAssetKeys(id);

  if (!(await repository.delete(id))) throw new PublicationNotFoundError(id);

  // Best-effort, como na biblioteca: o banco já não referencia nenhum destes arquivos, e derrubar
  // a resposta por um arquivo preso faria a tela dizer "não deu para excluir" sobre um livro que
  // já não existe.
  await Promise.all(keys.map((key) => storage.delete(asStorageKey(key)).catch(() => undefined)));

  return { ...contents, title: publication.title };
}

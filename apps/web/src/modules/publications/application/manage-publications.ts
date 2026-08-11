import {
  parsePublicationDraft,
  type PublicationDraftInput,
} from "@modules/publications/domain/publication-draft";
import type {
  PublicationDetail,
  PublicationRepository,
} from "@modules/publications/domain/publication-repository";
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

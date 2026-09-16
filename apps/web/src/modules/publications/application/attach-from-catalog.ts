import {
  preencherVazios,
  type CampoDoCatalogo,
  type CatalogMetadata,
} from "@modules/publications/domain/catalog-attach";
import { PREFERRED_SOURCE_FORMAT } from "@modules/publications/domain/catalog-import";
import {
  InvalidPublicationError,
  parsePublicationDraft,
  type PublicationDraft,
} from "@modules/publications/domain/publication-draft";
import type {
  PublicationDetail,
  PublicationRepository,
} from "@modules/publications/domain/publication-repository";
import type { LibraryCatalogProvider } from "@/shared/ports/library-catalog";

import { copyCatalogFilesTo, pdfDoCatalogo, type CatalogAssetWriter } from "./catalog-source";
import { CatalogEntryNotFoundError } from "./import-from-catalog";
import { PublicationNotFoundError } from "./manage-publications";

/**
 * **Anexar** o PDF fonte de um livro do Calibre a uma publicação que já existe — D44.
 *
 * Até aqui o catálogo só sabia **criar livro novo**: `Publication.sourcePdfAssetId` tinha dois
 * escritores no repositório inteiro, e nenhum deles alcançava um livro já cadastrado. Quem chegava
 * pela pendência "Sem PDF fonte anexado" ia parar na ingestão, e do Calibre não havia caminho
 * nenhum. Este caso de uso é esse caminho.
 *
 * O que ele **não** faz, e é decisão:
 *
 * - **não grava `CatalogOrigin`** (D44.3). Importar registra a origem em `metadataJson` porque o
 *   livro nasceu do catálogo; anexar pega um arquivo emprestado de uma origem e vai embora. A
 *   consequência foi aceita por escrito: a duplicata do catálogo não reconhecerá estes livros pelo
 *   identificador, e cairá para ISBN ou título parecido;
 * - **não sobrescreve nada** (D44.2 e D44.5). Metadado só entra em campo vazio; a capa só entra se
 *   não houver capa; e a fonte só é trocada com confirmação explícita — a anterior continua sendo
 *   `Asset` do livro, porque os recortes já feitos apontam para ela;
 * - **não referencia o arquivo onde ele está** (D26/D44.4). O PDF é **copiado** para o
 *   `StorageProvider`, como na importação.
 */

/** O livro escolhido no Calibre não tem PDF — e EPUB não vira PDF fonte. */
export class CatalogPdfMissingError extends Error {
  constructor(
    readonly title: string,
    readonly availableFormats: readonly string[],
  ) {
    super(
      availableFormats.length === 0
        ? `“${title}” não tem arquivo nenhum no catálogo.`
        : `“${title}” não tem PDF no catálogo — só ${availableFormats.join(", ")}. ` +
          "Só o PDF serve de fonte para recortar.",
    );
    this.name = "CatalogPdfMissingError";
  }
}

/**
 * O livro já tem PDF fonte, e ninguém pediu para trocar.
 *
 * Não é parede: é a pergunta que falta. Quem confirma manda de novo com `replace`, e o arquivo
 * anterior continua no acervo, ligado ao livro (D44.5).
 */
export class PublicationHasSourceError extends Error {
  constructor(
    readonly publicationId: string,
    readonly currentSourcePdfAssetId: string,
  ) {
    super("Este livro já tem um PDF fonte. Trocar não apaga o anterior — mas precisa ser dito.");
    this.name = "PublicationHasSourceError";
  }
}

export interface AttachSourceInput {
  readonly publicationId: string;
  readonly sourcePdfAssetId: string;
  /** Só quando o livro não tinha capa. `null` **nunca** apaga a que está lá. */
  readonly coverAssetId: string | null;
  /**
   * A fonte que estava no livro quando a decisão foi tomada — `null` para "estava sem fonte".
   *
   * É a mesma proteção do `updateMany` da ingestão, generalizada: a condição viaja com a escrita
   * em vez de virar um `if` depois de uma leitura que já envelheceu. Quem perde a corrida não
   * sobrescreve nada e ouve a pergunta de novo.
   */
  readonly expectedSourcePdfAssetId: string | null;
}

export interface AttachSourceResult {
  /** `false` quando a fonte mudou entre a leitura e a escrita. */
  readonly attached: boolean;
  /**
   * `false` quando o `Asset` gravado pertence a **outro** livro.
   *
   * Acontece de verdade: a chave de storage contém o hash do conteúdo, então subir o mesmo PDF
   * duas vezes reaproveita a linha que já existe. Se essa linha for de outro livro, a fonte aponta
   * para um arquivo certo com dono errado — e a tela precisa poder dizer isso em vez de mentir.
   */
  readonly ownedByBook: boolean;
}

/** Aponta o PDF fonte de um livro que já existe. O adaptador é quem garante a atomicidade. */
export interface PublicationSourceWriter {
  attachSource(input: AttachSourceInput): Promise<AttachSourceResult>;
}

interface Deps {
  readonly catalog: LibraryCatalogProvider;
  readonly publications: PublicationRepository;
  readonly assets: CatalogAssetWriter;
  readonly source: PublicationSourceWriter;
}

export interface AttachFromCatalogCommand {
  readonly publicationId: string;
  readonly externalId: string;
  readonly formats?: readonly string[];
  /** `true` quando a pessoa viu que o livro já tem fonte e confirmou a troca. */
  readonly replace?: boolean;
  /** `true` quando a pessoa aceitou preencher os campos vazios com o que o catálogo tem. */
  readonly fillMetadata?: boolean;
  readonly maxYear: number;
}

export interface AttachFromCatalogResult {
  readonly publication: PublicationDetail;
  readonly href: string;
  /** O nome do arquivo que virou a fonte — é o que a tela repete de volta. */
  readonly filename: string;
  /** A fonte anterior, quando houve troca. Continua no acervo. */
  readonly replaced: string | null;
  /** O que foi preenchido, campo a campo. Vazio quando não se pediu nada. */
  readonly filled: readonly CampoDoCatalogo[];
  readonly warnings: readonly string[];
}

export async function attachFromCatalog(
  deps: Deps,
  command: AttachFromCatalogCommand,
): Promise<AttachFromCatalogResult> {
  const publication = await deps.publications.findDetailById(command.publicationId);
  if (!publication) throw new PublicationNotFoundError(command.publicationId);

  const formats = command.formats ?? [PREFERRED_SOURCE_FORMAT];
  const book = await deps.catalog.read(command.externalId, formats);
  if (book === null) throw new CatalogEntryNotFoundError(command.externalId);

  /**
   * Sem PDF, o pedido morre **aqui** — antes de copiar byte nenhum.
   *
   * A importação trata isto como aviso, e está certa: lá o livro entra no acervo de qualquer jeito
   * e a fonte é o que falta. Aqui o pedido inteiro *era* a fonte. Anexar um EPUB como se fosse
   * seria a mentira que a pessoa só descobriria ao tentar recortar.
   */
  const pdf = pdfDoCatalogo(book);
  if (pdf === undefined) {
    throw new CatalogPdfMissingError(
      book.entry.title,
      [...new Set(book.entry.files.map((file) => file.format))].sort(),
    );
  }

  const fonteAtual = publication.sourcePdfAssetId;
  if (fonteAtual !== null && command.replace !== true) {
    throw new PublicationHasSourceError(publication.id, fonteAtual);
  }

  const warnings: string[] = [];

  const copiados = await copyCatalogFilesTo(deps, {
    workspaceId: publication.workspaceId,
    publicationId: publication.id,
    book,
    withCover: publication.coverAssetId === null,
  });

  const sourcePdfAssetId = copiados.sourcePdfAssetId;
  // O `pdfDoCatalogo` acima já garantiu que há PDF; esta guarda é o tipo, não a regra.
  if (sourcePdfAssetId === null) {
    throw new CatalogPdfMissingError(book.entry.title, []);
  }

  const escrita = await deps.source.attachSource({
    publicationId: publication.id,
    sourcePdfAssetId,
    coverAssetId: copiados.coverAssetId,
    expectedSourcePdfAssetId: fonteAtual,
  });

  // Perdeu a corrida: alguém anexou uma fonte entre a leitura e a escrita. O asset gravado
  // continua pertencendo ao livro — é o mesmo desfecho do segundo upload simultâneo da ingestão.
  if (!escrita.attached) {
    throw new PublicationHasSourceError(publication.id, fonteAtual ?? sourcePdfAssetId);
  }

  if (!escrita.ownedByBook) {
    warnings.push(
      "Este mesmo arquivo já estava no acervo por outro livro — a fonte aponta para ele, " +
        "e o conteúdo é o mesmo.",
    );
  }

  if (copiados.coverAssetId === null && book.cover && publication.coverAssetId !== null) {
    warnings.push("A capa do livro foi mantida — a do catálogo não substitui a que já estava lá.");
  }

  const { publication: atualizada, filled } = await preencher(deps, publication, book.entry, {
    fillMetadata: command.fillMetadata === true,
    maxYear: command.maxYear,
    warnings,
  });

  return {
    publication: {
      ...atualizada,
      sourcePdfAssetId,
      coverAssetId: copiados.coverAssetId ?? atualizada.coverAssetId,
    },
    href: `/publications/${publication.id}`,
    filename: pdf.file.filename,
    replaced: fonteAtual,
    filled,
    warnings,
  };
}

/**
 * Preenche os campos vazios — pelo **mesmo** caminho de escrita da edição manual.
 *
 * Passar pelo `PublicationRepository.update` com um rascunho validado é o que mantém uma porta só:
 * o ISBN do catálogo vai ao mesmo validador que recusaria o digitado à mão, e a recusa vira aviso
 * em vez de derrubar o anexo — que já aconteceu, e é a mesma decisão que a importação tomou.
 */
async function preencher(
  deps: Pick<Deps, "publications">,
  publication: PublicationDetail,
  entry: CatalogMetadata,
  options: { fillMetadata: boolean; maxYear: number; warnings: string[] },
): Promise<{ publication: PublicationDetail; filled: readonly CampoDoCatalogo[] }> {
  if (!options.fillMetadata) return { publication, filled: [] };

  const { draft, campos } = preencherVazios(rascunhoDe(publication), entry);
  if (campos.length === 0) return { publication, filled: [] };

  // O mesmo validador do cadastro manual, para o que veio do catálogo não entrar por outra porta.
  const gravar = async (valores: PublicationDraft): Promise<PublicationDetail | null> =>
    deps.publications.update(publication.id, parsePublicationDraft(valores, options.maxYear));

  try {
    const atualizada = await gravar(draft);
    return { publication: atualizada ?? publication, filled: campos };
  } catch (error) {
    if (!(error instanceof InvalidPublicationError) || error.field !== "isbn") throw error;

    options.warnings.push(
      `ISBN do catálogo recusado (${String(draft.isbn)}) — o resto dos campos entrou.`,
    );

    const semIsbn = campos.filter((campo) => campo.field !== "isbn");
    if (semIsbn.length === 0) return { publication, filled: [] };

    const atualizada = await gravar({ ...draft, isbn: null });
    return { publication: atualizada ?? publication, filled: semIsbn };
  }
}

/**
 * O rascunho equivalente ao livro como ele está hoje.
 *
 * Campo a campo, e não `...publication`: `PublicationDetail` carrega contagens e datas que não são
 * do formulário, e um espalhamento as mandaria para a escrita no dia em que alguém acrescentar uma.
 */
const rascunhoDe = (publication: PublicationDetail): PublicationDraft => ({
  title: publication.title,
  subtitle: publication.subtitle,
  nickname: publication.nickname,
  authors: publication.authors,
  publisher: publication.publisher,
  edition: publication.edition,
  editionYear: publication.editionYear,
  isbn: publication.isbn,
  language: publication.language,
  series: publication.series,
  volume: publication.volume,
  notes: publication.notes,
});

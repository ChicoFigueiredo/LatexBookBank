import {
  blocks,
  draftFromCatalog,
  duplicateSignalFor,
  originOf,
  PREFERRED_SOURCE_FORMAT,
  type DuplicateSignal,
  type ExistingPublication,
} from "@modules/publications/domain/catalog-import";
import { InvalidPublicationError } from "@modules/publications/domain/publication-draft";
import type { PublicationDetail } from "@modules/publications/domain/publication-repository";
import { LibraryNotFoundError } from "@modules/workspaces/domain/library";
import type { LibraryRepository } from "@modules/workspaces/domain/library-repository";
import type { CatalogEntry, LibraryCatalogProvider } from "@/shared/ports/library-catalog";

import { createPublication } from "./manage-publications";

/**
 * Importar um livro de um catálogo externo.
 *
 * A jornada da §30: selecionar biblioteca → catálogo → pesquisar → selecionar → revisar metadados
 * → escolher fonte → importar → abrir. Este arquivo é o "importar", e o que ele **não** faz é tão
 * importante quanto o que faz:
 *
 * - não conhece Calibre. Recebe um `LibraryCatalogProvider` e um `externalId`;
 * - não tem caminho de escrita próprio. A publicação nasce pelo **mesmo** `createPublication` do
 *   cadastro manual, então validação, autores e normalização são os mesmos;
 * - não referencia arquivo externo. O PDF e a capa são **copiados** para o storage gerenciado
 *   (§29), porque acervo que aponta para fora quebra quando a pasta do Calibre muda de lugar.
 */

export class CatalogEntryNotFoundError extends Error {
  constructor(readonly externalId: string) {
    super(`O livro ${externalId} não está mais no catálogo.`);
    this.name = "CatalogEntryNotFoundError";
  }
}

export class DuplicatePublicationError extends Error {
  constructor(
    readonly signal: DuplicateSignal,
    readonly publicationId: string,
  ) {
    super(
      signal === "external-id"
        ? "Este livro já foi importado deste catálogo."
        : "Já existe um livro com este ISBN no acervo.",
    );
    this.name = "DuplicatePublicationError";
  }
}

/** Grava um arquivo no storage gerenciado e devolve o `Asset` criado. */
export interface CatalogAssetWriter {
  store(input: {
    readonly workspaceId: string;
    readonly publicationId: string | null;
    readonly filename: string;
    readonly mimeType: string;
    readonly content: Uint8Array;
    /** `ATTACHMENT` para os formatos que não são fonte de captura — EPUB, MOBI. */
    readonly kind: "SOURCE_PDF" | "COVER" | "ATTACHMENT";
  }): Promise<{ readonly id: string }>;
}

/** Liga capa, fonte e origem à publicação recém-criada. */
export interface PublicationOriginWriter {
  attachOrigin(
    publicationId: string,
    input: {
      readonly coverAssetId: string | null;
      readonly sourcePdfAssetId: string | null;
      readonly metadataJson: string;
      readonly importedAt: Date;
    },
  ): Promise<void>;
}

export interface ImportFromCatalogResult {
  readonly publication: PublicationDetail;
  readonly href: string;
  readonly warnings: readonly string[];
}

interface Deps {
  readonly catalog: LibraryCatalogProvider;
  readonly libraries: LibraryRepository;
  readonly publications: Parameters<typeof createPublication>[0]["publications"];
  readonly assets: CatalogAssetWriter;
  readonly origin: PublicationOriginWriter;
  /** As publicações que já existem na biblioteca, para a checagem de duplicata. */
  readonly existing: (libraryId: string) => Promise<readonly ExistingPublication[]>;
}

export interface ImportFromCatalogCommand {
  readonly libraryId: string;
  readonly externalId: string;
  /** Formatos a copiar. Sem isto, só o preferido — o PDF. */
  readonly formats?: readonly string[];
  /** `true` quando o usuário já viu o aviso de duplicata e decidiu importar assim mesmo. */
  readonly force?: boolean;
  readonly maxYear: number;
  readonly now: Date;
}

export async function importFromCatalog(
  deps: Deps,
  command: ImportFromCatalogCommand,
): Promise<ImportFromCatalogResult> {
  const library = await deps.libraries.findById(command.libraryId);
  if (!library) throw new LibraryNotFoundError(command.libraryId);

  const formats = command.formats ?? [PREFERRED_SOURCE_FORMAT];
  const book = await deps.catalog.read(command.externalId, formats);
  if (book === null) throw new CatalogEntryNotFoundError(command.externalId);

  const { entry } = book;
  const warnings: string[] = [];

  const duplicata = duplicateSignalFor(entry, await deps.existing(command.libraryId));
  if (duplicata.signal !== null && duplicata.publicationId !== null) {
    if (blocks(duplicata.signal) && command.force !== true) {
      throw new DuplicatePublicationError(duplicata.signal, duplicata.publicationId);
    }
    warnings.push(
      duplicata.signal === "title-and-author"
        ? "Já existe um livro com título e autor parecidos — confira se não é o mesmo."
        : "Importado mesmo com sinal de duplicata, a seu pedido.",
    );
  }

  /**
   * O ISBN do catálogo é campo livre no Calibre, e vem errado com frequência.
   *
   * Recusar o livro inteiro por causa dele seria deixar de fora um livro que o usuário quer, por
   * um dado que ele pode corrigir depois em dois cliques. O livro entra sem ISBN, **e o aviso
   * diz** — silenciar seria pior: o campo apareceria vazio sem explicação.
   */
  let draft = draftFromCatalog(entry);
  let publication: PublicationDetail;

  try {
    publication = await createPublication(
      { publications: deps.publications, libraries: deps.libraries },
      command.libraryId,
      draft,
      command.maxYear,
    );
  } catch (error) {
    if (!(error instanceof InvalidPublicationError) || error.field !== "isbn") throw error;

    warnings.push(`ISBN do catálogo recusado (${entry.isbn}) — o livro entrou sem ele.`);
    draft = { ...draft, isbn: null };

    publication = await createPublication(
      { publications: deps.publications, libraries: deps.libraries },
      command.libraryId,
      draft,
      command.maxYear,
    );
  }

  // Os arquivos entram **depois** da publicação: eles são dela, e um asset gravado antes ficaria
  // órfão se a criação falhasse. O storage não é transacional; a ordem é a proteção que há.
  const pdf = book.files.find((item) => item.file.format === PREFERRED_SOURCE_FORMAT);
  const sourcePdf = pdf
    ? await deps.assets.store({
        workspaceId: library.id,
        publicationId: publication.id,
        filename: pdf.file.filename,
        mimeType: "application/pdf",
        content: pdf.content,
        kind: "SOURCE_PDF",
      })
    : null;

  if (pdf === undefined) {
    warnings.push("O catálogo não tem PDF deste livro — a captura por recorte não vai funcionar.");
  }

  const cover = book.cover
    ? await deps.assets.store({
        workspaceId: library.id,
        publicationId: publication.id,
        filename: book.cover.filename,
        mimeType: "image/jpeg",
        content: book.cover.content,
        kind: "COVER",
      })
    : null;

  const origem = {
    coverAssetId: cover?.id ?? null,
    sourcePdfAssetId: sourcePdf?.id ?? null,
    metadataJson: JSON.stringify(originOf(deps.catalog.id, entry, command.now.toISOString())),
    importedAt: command.now,
  };

  await deps.origin.attachOrigin(publication.id, origem);

  return {
    // Com a capa e a fonte já ligadas. A publicação devolvida por `createPublication` é de antes
    // do `attachOrigin`, e entregá-la assim faria a resposta dizer "sem capa" sobre um livro que
    // acabou de receber uma.
    publication: {
      ...publication,
      coverAssetId: origem.coverAssetId,
      sourcePdfAssetId: origem.sourcePdfAssetId,
    },
    // Depois de importar, o livro precisa **abrir** (§30). Sem a rota de volta, a jornada termina
    // numa mensagem de sucesso e o usuário procura o livro à mão.
    href: `/publications/${publication.id}`,
    warnings,
  };
}

/**
 * Importar vários livros do catálogo de uma vez (§ "o Calibre ainda não faz" — beta-editorial.md).
 *
 * Não é `Promise.all`: os livros entram **um de cada vez**, de propósito. `deps.existing` consulta
 * o banco de novo a cada chamada de `importFromCatalog`, e é isso que faz o terceiro livro do lote
 * enxergar o primeiro como duplicata se os dois forem o mesmo título — em paralelo, os três
 * consultariam o banco **antes** de qualquer um ter sido escrito, e nenhum veria os outros.
 *
 * Um livro que falha não derruba o lote: a pessoa que importa dez livros de um catálogo não quer
 * perder os nove bons porque o décimo tinha ISBN estranho ou já existe — quer saber qual foi e
 * seguir com o resto.
 */
export interface ImportManyFromCatalogCommand {
  readonly libraryId: string;
  readonly externalIds: readonly string[];
  readonly formats?: readonly string[];
  readonly force?: boolean;
  readonly maxYear: number;
  readonly now: Date;
}

export type ImportManyOutcome =
  | { readonly kind: "imported"; readonly result: ImportFromCatalogResult }
  | { readonly kind: "failed"; readonly message: string };

export interface ImportManyResult {
  readonly externalId: string;
  readonly outcome: ImportManyOutcome;
}

export interface ImportManyFromCatalogReport {
  readonly results: readonly ImportManyResult[];
}

export async function importManyFromCatalog(
  deps: Deps,
  command: ImportManyFromCatalogCommand,
): Promise<ImportManyFromCatalogReport> {
  const results: ImportManyResult[] = [];

  for (const externalId of command.externalIds) {
    try {
      const result = await importFromCatalog(deps, {
        libraryId: command.libraryId,
        externalId,
        ...(command.formats !== undefined ? { formats: command.formats } : {}),
        force: command.force ?? false,
        maxYear: command.maxYear,
        now: command.now,
      });
      results.push({ externalId, outcome: { kind: "imported", result } });
    } catch (error) {
      results.push({
        externalId,
        outcome: {
          kind: "failed",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  return { results };
}

/** O que a tela do catálogo mostra antes de importar. */
export async function browseCatalog(
  catalog: LibraryCatalogProvider,
  existing: readonly ExistingPublication[],
  query: string,
): Promise<readonly (CatalogEntry & { readonly duplicate: DuplicateSignal })[]> {
  const entries = await catalog.list(query);

  // O sinal de duplicata vem na **lista**, não só na hora de importar: ver "já está no acervo"
  // antes de clicar poupa a viagem inteira, e é o que o design §17 chama de "possível duplicata".
  return entries.map((entry) => ({
    ...entry,
    duplicate: duplicateSignalFor(entry, existing).signal,
  }));
}

import type { CampoDoCatalogo } from "@modules/publications/domain/catalog-attach";
import type { DuplicateSignal } from "@modules/publications/domain/catalog-import";
import type { CatalogEntry, CatalogSummary } from "@/shared/ports/library-catalog";

/**
 * O contrato HTTP das rotas do catálogo (Calibre), do jeito que a tela o lê.
 *
 * Só tipos, sem nada de servidor: a rota anota a resposta com eles (`satisfies`) e o cliente
 * (`publications/ui/catalog-client.ts`) importa os mesmos (ARQ-10 da revisão de 2026-09-23).
 *
 * Os resultados de importar e anexar levam também a `publication` inteira; a tela não a lê, e o
 * contrato não a promete — quem precisar dela acrescenta o campo aqui, com o tipo do fio.
 */

/** Um livro do catálogo, com o sinal de duplicata contra o acervo. */
export type CatalogEntryDto = CatalogEntry & { readonly duplicate: DuplicateSignal };

/** `POST /api/catalog`, 200: o resumo do catálogo e a página de livros da busca. */
export interface BrowseCatalogResponse {
  readonly summary: CatalogSummary;
  readonly entries: readonly CatalogEntryDto[];
}

/** `POST /api/catalog/import`, 201. */
export interface ImportFromCatalogResponse {
  /** Para onde a tela leva depois de importar. */
  readonly href: string;
  readonly warnings: readonly string[];
}

/** `POST /api/catalog/import-batch`, 201: um resultado por livro, na ordem pedida. */
export interface ImportBatchResponse {
  readonly results: readonly {
    readonly externalId: string;
    readonly outcome:
      | { readonly kind: "imported"; readonly result: ImportFromCatalogResponse }
      | { readonly kind: "failed"; readonly message: string };
  }[];
}

/** `POST /api/catalog/attach`, 200. */
export interface AttachFromCatalogResponse {
  readonly href: string;
  /** O nome do arquivo que virou a fonte. */
  readonly filename: string;
  /** A fonte anterior, quando houve troca. */
  readonly replaced: string | null;
  readonly filled: readonly CampoDoCatalogo[];
  readonly warnings: readonly string[];
}

/** A recusa de importar porque o livro já está no acervo (409): a tela oferece abrir o que existe. */
export interface DuplicatePublicationBody {
  readonly error: "duplicate_publication";
  readonly message: string;
  readonly publicationId: string;
}

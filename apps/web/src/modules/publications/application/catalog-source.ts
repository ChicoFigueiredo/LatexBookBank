import { PREFERRED_SOURCE_FORMAT } from "@modules/publications/domain/catalog-import";
import type { CatalogBook } from "@/shared/ports/library-catalog";

/**
 * Copiar o que o catálogo tem para dentro de **uma publicação que já existe**.
 *
 * Este arquivo é a fatia comum entre importar e anexar. Ela existia dentro de `importFromCatalog`,
 * depois do `createPublication`, e a D44 pediu o mesmo passo para um livro que já estava no acervo
 * — copiar o PDF, copiar a capa, apontar a fonte. Duplicá-lo daria dois lugares para lembrar de
 * `kind: "SOURCE_PDF"`, dois lugares para lembrar do `mimeType` e dois lugares para esquecer
 * `publicationId`. Importar passou a ser *criar a publicação e depois isto*.
 *
 * O que continua **fora** daqui é o que difere entre os dois caminhos, e é o que a D44 separa:
 * importar registra a origem do catálogo em `metadataJson`; anexar **não**, porque o Calibre é
 * origem e não dono.
 */

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

export interface CopyCatalogFilesInput {
  readonly workspaceId: string;
  readonly publicationId: string;
  readonly book: CatalogBook;
  /**
   * Copiar a capa?
   *
   * `false` quando o livro **já tem** uma: a mesma regra dos metadados (D44.2) aplicada ao
   * arquivo. Um livro que alguém cadastrou com capa escolhida à mão não perde a capa por ter
   * ganhado um PDF, e os bytes nem chegam a ser gravados — a decisão vem antes da escrita.
   */
  readonly withCover: boolean;
}

export interface CopiedCatalogFiles {
  /** `null` quando o livro do catálogo não tem PDF. Quem exige um decide antes de chamar. */
  readonly sourcePdfAssetId: string | null;
  readonly coverAssetId: string | null;
}

/** O arquivo do catálogo que serve de PDF fonte, ou `undefined`. */
export const pdfDoCatalogo = (book: CatalogBook) =>
  book.files.find((item) => item.file.format === PREFERRED_SOURCE_FORMAT);

export async function copyCatalogFilesTo(
  deps: { readonly assets: CatalogAssetWriter },
  input: CopyCatalogFilesInput,
): Promise<CopiedCatalogFiles> {
  const pdf = pdfDoCatalogo(input.book);

  const sourcePdf = pdf
    ? await deps.assets.store({
        workspaceId: input.workspaceId,
        publicationId: input.publicationId,
        filename: pdf.file.filename,
        mimeType: "application/pdf",
        content: pdf.content,
        kind: "SOURCE_PDF",
      })
    : null;

  const cover =
    input.withCover && input.book.cover
      ? await deps.assets.store({
          workspaceId: input.workspaceId,
          publicationId: input.publicationId,
          filename: input.book.cover.filename,
          mimeType: "image/jpeg",
          content: input.book.cover.content,
          kind: "COVER",
        })
      : null;

  return { sourcePdfAssetId: sourcePdf?.id ?? null, coverAssetId: cover?.id ?? null };
}

import type { CatalogEntry } from "@/shared/ports/library-catalog";

import type { PublicationDraftInput } from "./publication-draft";

/**
 * Do catálogo externo para o formulário que o cadastro manual já usa.
 *
 * É aqui que o Calibre deixa de existir. A saída é `PublicationDraftInput` — o **mesmo** que a
 * tela de cadastro manual produz —, então a importação passa pelo mesmo `parsePublicationDraft`,
 * pela mesma validação de ISBN e pelo mesmo caso de uso. Um caminho de escrita separado para
 * livro importado seria a segunda porta que diverge da primeira na primeira mudança.
 */

/** O formato preferido como fonte de captura. PDF, porque é dele que sai recorte. */
export const PREFERRED_SOURCE_FORMAT = "PDF";

export function draftFromCatalog(entry: CatalogEntry): PublicationDraftInput {
  return {
    title: entry.title,
    authors: [...entry.authors],
    publisher: entry.publisher,
    editionYear: entry.year,
    // O ISBN do catálogo pode estar errado — é campo livre no Calibre. Mandá-lo pelo mesmo
    // validador é o certo, **e** é por isso que `importFromCatalog` trata a recusa como aviso em
    // vez de erro: um ISBN torto não pode impedir o livro de entrar no acervo.
    isbn: entry.isbn,
    language: entry.language,
    series: entry.series,
    // Volume **só quando há coleção**. O Calibre grava `series_index = 1.0` em todo livro, com ou
    // sem série; importar isso literalmente daria "volume 1" em livro avulso — ruído que a ficha
    // do livro passaria a carregar para sempre. Visto contra o acervo real.
    volume: entry.series === null ? null : entry.seriesIndex,
  };
}

/**
 * O que fica registrado sobre a origem, em `Publication.metadataJson`.
 *
 * O `externalId` é a chave de idempotência: reimportar o mesmo livro encontra o que já entrou em
 * vez de duplicar. Os formatos entram porque respondem "o que mais havia lá?" sem obrigar a abrir
 * o Calibre de novo.
 */
export interface CatalogOrigin {
  readonly provider: string;
  readonly externalId: string;
  readonly importedAt: string;
  readonly availableFormats: readonly string[];
}

export const originOf = (
  providerId: string,
  entry: CatalogEntry,
  importedAt: string,
): CatalogOrigin => ({
  provider: providerId,
  externalId: entry.externalId,
  importedAt,
  availableFormats: [...new Set(entry.files.map((file) => file.format))].sort(),
});

/**
 * Três sinais de duplicata, do exato ao provável (spike, pergunta 10).
 *
 * O `externalId` e o ISBN **bloqueiam**; título mais autor apenas **avisa**. Dois volumes de uma
 * coleção têm títulos parecidos de propósito, e recusar por semelhança faria o produto esconder
 * do usuário um livro que ele quer importar.
 */
export type DuplicateSignal = "external-id" | "isbn" | "title-and-author" | null;

export interface ExistingPublication {
  readonly id: string;
  readonly title: string;
  readonly isbn: string | null;
  readonly authors: readonly string[];
  readonly externalId: string | null;
}

export function duplicateSignalFor(
  entry: CatalogEntry,
  existing: readonly ExistingPublication[],
): { readonly signal: DuplicateSignal; readonly publicationId: string | null } {
  const porExterno = existing.find((row) => row.externalId === entry.externalId);
  if (porExterno) return { signal: "external-id", publicationId: porExterno.id };

  const isbn = normalizeIsbn(entry.isbn);
  if (isbn !== null) {
    const porIsbn = existing.find((row) => normalizeIsbn(row.isbn) === isbn);
    if (porIsbn) return { signal: "isbn", publicationId: porIsbn.id };
  }

  const chave = titleKey(entry.title, entry.authors);
  const porTitulo = existing.find((row) => titleKey(row.title, row.authors) === chave);
  if (porTitulo) return { signal: "title-and-author", publicationId: porTitulo.id };

  return { signal: null, publicationId: null };
}

/** É bloqueio, ou é só um aviso? */
export const blocks = (signal: DuplicateSignal): boolean =>
  signal === "external-id" || signal === "isbn";

const normalizeIsbn = (value: string | null): string | null => {
  if (value === null) return null;
  const limpo = value.replace(/[\s-]/g, "").toUpperCase();
  return limpo === "" ? null : limpo;
};

/** Título e primeiro autor, sem acento nem caixa — o suficiente para desconfiar, não para decidir. */
const titleKey = (title: string, authors: readonly string[]): string =>
  [title, authors[0] ?? ""]
    .join("|")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9|]+/g, " ")
    .trim();
